import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const JWT_SECRET = process.env.SESSION_SECRET || "hackathon_secret";
const SALT_ROUNDS = 10;
const revokedTokens = new Set<string>();

export async function registerRoutes(
    httpServer: Server,
    app: Express
): Promise<Server> {
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.status(401).json({ message: "No token provided" });

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

  // FIXED: N+1 queries (Bug 2)
  app.get(api.transactions.list.path, authenticateToken, async (req: any, res) => {
    const accountId = Number(req.params.accountId);
    const account = await storage.getAccount(accountId);
    if (!account || account.userId !== req.user.id) return res.status(403).json({ message: "Forbidden" });

    const enriched = await storage.getTransactionsWithCategories(accountId);
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

  // FIXED: Race condition (Bug 1)
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

      const debited = await storage.debitAccountIfSufficient(
          input.fromAccountId,
          input.amount
      );

      if (!debited) {
        return res.status(400).json({ message: "Insufficient funds" });
      }

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

  // Analytics endpoints (Feature 1)
  app.get("/api/analytics/spending-by-category", authenticateToken, async (req: any, res) => {
    try {
      const data = await storage.getSpendingByCategory(req.user.id);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/analytics/monthly-trends", authenticateToken, async (req: any, res) => {
    try {
      const data = await storage.getMonthlyTrends(req.user.id);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/analytics/budget-vs-actual", authenticateToken, async (req: any, res) => {
    try {
      const data = await storage.getBudgetVsActual(req.user.id);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Savings Goals endpoints (Feature 2)
  app.get("/api/savings/goals", authenticateToken, async (req: any, res) => {
    try {
      const goals = await storage.getSavingsGoals(req.user.id);
      res.json(goals);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/savings/goals", authenticateToken, async (req: any, res) => {
    try {
      const { name, targetAmount, deadline } = req.body;
      if (!name || !targetAmount) {
        return res.status(400).json({ message: "name and targetAmount are required" });
      }
      const goal = await storage.createSavingsGoal({
        userId: req.user.id,
        name,
        targetAmount,
        deadline: deadline ? new Date(deadline) : null,
      });
      res.status(201).json(goal);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/savings/goals/:id", authenticateToken, async (req: any, res) => {
    try {
      const goal = await storage.getSavingsGoal(Number(req.params.id));
      if (!goal) return res.status(404).json({ message: "Goal not found" });
      if (goal.userId !== req.user.id) return res.status(403).json({ message: "Forbidden" });

      const { name, targetAmount, deadline } = req.body;
      const updated = await storage.updateSavingsGoal(goal.id, {
        ...(name && { name }),
        ...(targetAmount && { targetAmount }),
        ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
      });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/savings/goals/:id", authenticateToken, async (req: any, res) => {
    try {
      const goal = await storage.getSavingsGoal(Number(req.params.id));
      if (!goal) return res.status(404).json({ message: "Goal not found" });
      if (goal.userId !== req.user.id) return res.status(403).json({ message: "Forbidden" });

      await storage.deleteSavingsGoal(goal.id);
      res.status(200).json({ message: "Goal deleted" });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/savings/goals/:id/contributions", authenticateToken, async (req: any, res) => {
    try {
      const goal = await storage.getSavingsGoal(Number(req.params.id));
      if (!goal) return res.status(404).json({ message: "Goal not found" });
      if (goal.userId !== req.user.id) return res.status(403).json({ message: "Forbidden" });

      const { amount, note } = req.body;
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ message: "Valid amount is required" });
      }

      const contribution = await storage.addContribution({
        goalId: goal.id,
        amount,
        note: note || null,
      });
      res.status(201).json(contribution);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}