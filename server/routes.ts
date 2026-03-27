import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const JWT_SECRET = process.env.SESSION_SECRET || "hackathon_secret";
const SALT_ROUNDS = 10;

// In-memory token blacklist (swap for a DB table in production)
const revokedTokens = new Set<string>();

export async function registerRoutes(
    httpServer: Server,
    app: Express
): Promise<Server> {
  // Middleware to authenticate JWT
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.status(401).json({ message: "No token provided" });

    // ✅ Reject revoked tokens
    if (revokedTokens.has(token)) {
      return res.status(401).json({ message: "Token has been revoked" });
    }

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.status(403).json({ message: "Invalid token" });
      req.user = user;
      req.token = token;
      next();
    });
  };

  // Auth routes
  app.post(api.auth.register.path, async (req, res) => {
    try {
      const input = api.auth.register.input.parse(req.body);
      const existingUser = await storage.getUserByEmail(input.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already exists" });
      }

      // ✅ Hash password before storing
      const hashedPassword = await bcrypt.hash(input.password, SALT_ROUNDS);
      const user = await storage.createUser({ ...input, password: hashedPassword });

      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
      res.status(201).json({ token, user });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.auth.login.path, async (req, res) => {
    try {
      const input = api.auth.login.input.parse(req.body);
      const user = await storage.getUserByEmail(input.email);

      // ✅ Compare against hashed password
      const passwordMatch = user && await bcrypt.compare(input.password, user.password);
      if (!user || !passwordMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
      res.status(200).json({ token, user });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ✅ Logout route — revokes the token server-side
  app.post("/api/auth/logout", authenticateToken, (req: any, res) => {
    revokedTokens.add(req.token);
    res.status(200).json({ message: "Logged out successfully" });
  });

  // Protected routes
  app.get(api.accounts.list.path, authenticateToken, async (req: any, res) => {
    const accounts = await storage.getAccounts(req.user.id);
    res.json(accounts);
  });

  app.get(api.accounts.get.path, authenticateToken, async (req: any, res) => {
    const account = await storage.getAccount(Number(req.params.id));
    if (!account) return res.status(404).json({ message: "Account not found" });
    if (account.userId !== req.user.id) return res.status(403).json({ message: "Forbidden" });
    res.json(account);
  });

  // BUGGY: N+1 queries implementation (Challenge #2)
  app.get(api.transactions.list.path, authenticateToken, async (req: any, res) => {
    const accountId = Number(req.params.accountId);
    const account = await storage.getAccount(accountId);
    if (!account || account.userId !== req.user.id) return res.status(403).json({ message: "Forbidden" });

    const transactions = await storage.getTransactions(accountId);

    // 🔥 N+1 Queries: Intentionally fetching category for each transaction individually
    const enriched = [];
    for (const txn of transactions) {
      const category = await storage.getCategory(txn.categoryId);
      enriched.push({
        ...txn,
        category: category?.name || "Unknown"
      });
    }

    res.json(enriched);
  });

  app.get(api.categories.list.path, authenticateToken, async (req: any, res) => {
    const categories = await storage.getCategories();
    res.json(categories);
  });

  app.get(api.budgets.list.path, authenticateToken, async (req: any, res) => {
    const budgets = await storage.getBudgets(req.user.id);
    const categories = await storage.getCategories();

    const enriched = budgets.map(b => ({
      ...b,
      category: categories.find(c => c.id === b.categoryId)?.name
    }));
    res.json(enriched);
  });

  app.post(api.budgets.create.path, authenticateToken, async (req: any, res) => {
    try {
      const input = api.budgets.create.input.parse(req.body);
      const budget = await storage.createBudget({
        userId: req.user.id,
        categoryId: input.categoryId,
        limitAmount: input.limitAmount,
        period: input.period,
      });
      res.status(201).json(budget);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // BUGGY: Race condition implementation (Challenge #1)
  app.post(api.transfers.create.path, authenticateToken, async (req: any, res) => {
    try {
      const input = api.transfers.create.input.parse(req.body);

      const fromAcct = await storage.getAccount(input.fromAccountId);
      const toAcct = await storage.getAccount(input.toAccountId);

      if (!fromAcct || fromAcct.userId !== req.user.id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (!toAcct) {
        return res.status(404).json({ message: "Target account not found" });
      }

      if (fromAcct.balance < input.amount) {
        return res.status(400).json({ message: "Insufficient funds" });
      }

      // ⚠️ Simulate latency to make race condition reproducible
      await new Promise(resolve => setTimeout(resolve, 8));

      await storage.updateAccountBalance(input.fromAccountId, -input.amount);
      await storage.updateAccountBalance(input.toAccountId, input.amount);

      await storage.createTransaction({
        accountId: input.fromAccountId,
        categoryId: 1,
        amount: input.amount,
        type: "debit",
        description: `Transfer to ${toAcct.name}`
      });

      await storage.createTransaction({
        accountId: input.toAccountId,
        categoryId: 1,
        amount: input.amount,
        type: "credit",
        description: `Transfer from ${fromAcct.name}`
      });

      res.status(200).json({ message: "Transfer successful" });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}