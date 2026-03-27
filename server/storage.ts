import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import {
  users, accounts, categories, transactions, budgets,
  savingsGoals, savingsContributions,
  type User, type Account, type Category, type Transaction, type Budget,
  type SavingsGoal, type SavingsContribution
} from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: Omit<User, "id" | "createdAt">): Promise<User>;

  getAccounts(userId: number): Promise<Account[]>;
  getAccount(id: number): Promise<Account | undefined>;
  createAccount(account: Omit<Account, "id">): Promise<Account>;
  updateAccountBalance(id: number, amount: number): Promise<void>;
  debitAccountIfSufficient(id: number, amount: number): Promise<boolean>;

  getCategories(): Promise<Category[]>;
  getCategory(id: number): Promise<Category | undefined>;

  getTransactions(accountId: number): Promise<Transaction[]>;
  getTransactionsWithCategories(accountId: number): Promise<any[]>;
  createTransaction(tx: Omit<Transaction, "id" | "date">): Promise<Transaction>;

  getBudgets(userId: number): Promise<Budget[]>;
  createBudget(budget: Omit<Budget, "id">): Promise<Budget>;

  getSpendingByCategory(userId: number): Promise<{ name: string; total: number }[]>;
  getMonthlyTrends(userId: number): Promise<{ month: string; income: number; expenses: number }[]>;
  getBudgetVsActual(userId: number): Promise<{ category: string; budget: number; actual: number }[]>;

  getSavingsGoals(userId: number): Promise<SavingsGoal[]>;
  getSavingsGoal(id: number): Promise<SavingsGoal | undefined>;
  createSavingsGoal(goal: Omit<SavingsGoal, "id" | "createdAt" | "currentAmount">): Promise<SavingsGoal>;
  updateSavingsGoal(id: number, data: Partial<Omit<SavingsGoal, "id" | "userId" | "createdAt">>): Promise<SavingsGoal>;
  deleteSavingsGoal(id: number): Promise<void>;
  getContributions(goalId: number): Promise<SavingsContribution[]>;
  addContribution(contribution: Omit<SavingsContribution, "id" | "createdAt">): Promise<SavingsContribution>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: Omit<User, "id" | "createdAt">): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async getAccounts(userId: number): Promise<Account[]> {
    return await db.select().from(accounts).where(eq(accounts.userId, userId));
  }

  async getAccount(id: number): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
    return account;
  }

  async createAccount(account: Omit<Account, "id">): Promise<Account> {
    const [newAccount] = await db.insert(accounts).values(account).returning();
    return newAccount;
  }

  async updateAccountBalance(id: number, amount: number): Promise<void> {
    await db.update(accounts)
        .set({ balance: sql`${accounts.balance} + ${amount}` })
        .where(eq(accounts.id, id));
  }

  async debitAccountIfSufficient(id: number, amount: number): Promise<boolean> {
    const result = await db.update(accounts)
        .set({ balance: sql`${accounts.balance} - ${amount}` })
        .where(sql`${accounts.id} = ${id} AND ${accounts.balance} >= ${amount}`)
        .returning();

    return result.length > 0;
  }

  async getCategories(): Promise<Category[]> {
    return await db.select().from(categories);
  }

  async getCategory(id: number): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.id, id));
    return category;
  }

  async getTransactions(accountId: number): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.accountId, accountId));
  }

  async getTransactionsWithCategories(accountId: number): Promise<any[]> {
    return await db
        .select({
          id: transactions.id,
          accountId: transactions.accountId,
          categoryId: transactions.categoryId,
          amount: transactions.amount,
          type: transactions.type,
          description: transactions.description,
          date: transactions.date,
          category: categories.name,
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(eq(transactions.accountId, accountId));
  }

  async createTransaction(tx: Omit<Transaction, "id" | "date">): Promise<Transaction> {
    const [newTx] = await db.insert(transactions).values(tx).returning();
    return newTx;
  }

  async getBudgets(userId: number): Promise<Budget[]> {
    return await db.select().from(budgets).where(eq(budgets.userId, userId));
  }

  async createBudget(budget: Omit<Budget, "id">): Promise<Budget> {
    const [newBudget] = await db.insert(budgets).values(budget).returning();
    return newBudget;
  }

  async getSpendingByCategory(userId: number): Promise<{ name: string; total: number }[]> {
    return await db
        .select({
          name: categories.name,
          total: sql<number>`SUM(${transactions.amount})`,
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .where(sql`${accounts.userId} = ${userId} AND ${transactions.type} = 'debit'`)
        .groupBy(categories.id, categories.name);
  }

  async getMonthlyTrends(userId: number): Promise<{ month: string; income: number; expenses: number }[]> {
    return await db
        .select({
          month: sql<string>`TO_CHAR(${transactions.date}, 'YYYY-MM')`,
          income: sql<number>`SUM(CASE WHEN ${transactions.type} = 'credit' THEN ${transactions.amount} ELSE 0 END)`,
          expenses: sql<number>`SUM(CASE WHEN ${transactions.type} = 'debit' THEN ${transactions.amount} ELSE 0 END)`,
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(eq(accounts.userId, userId))
        .groupBy(sql`TO_CHAR(${transactions.date}, 'YYYY-MM')`)
        .orderBy(sql`TO_CHAR(${transactions.date}, 'YYYY-MM')`);
  }

  async getBudgetVsActual(userId: number): Promise<{ category: string; budget: number; actual: number }[]> {
    return await db
        .select({
          category: categories.name,
          budget: budgets.limitAmount,
          actual: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
        })
        .from(budgets)
        .innerJoin(categories, eq(budgets.categoryId, categories.id))
        .leftJoin(
            transactions,
            sql`${transactions.categoryId} = ${budgets.categoryId}
          AND ${transactions.type} = 'debit'
          AND ${transactions.accountId} IN (
            SELECT id FROM accounts WHERE user_id = ${userId}
          )`
        )
        .where(eq(budgets.userId, userId))
        .groupBy(budgets.id, categories.name, budgets.limitAmount);
  }

  async getSavingsGoals(userId: number): Promise<SavingsGoal[]> {
    return await db.select().from(savingsGoals).where(eq(savingsGoals.userId, userId));
  }

  async getSavingsGoal(id: number): Promise<SavingsGoal | undefined> {
    const [goal] = await db.select().from(savingsGoals).where(eq(savingsGoals.id, id));
    return goal;
  }

  async createSavingsGoal(goal: Omit<SavingsGoal, "id" | "createdAt" | "currentAmount">): Promise<SavingsGoal> {
    const [newGoal] = await db.insert(savingsGoals).values({ ...goal, currentAmount: 0 }).returning();
    return newGoal;
  }

  async updateSavingsGoal(id: number, data: Partial<Omit<SavingsGoal, "id" | "userId" | "createdAt">>): Promise<SavingsGoal> {
    const [updated] = await db.update(savingsGoals).set(data).where(eq(savingsGoals.id, id)).returning();
    return updated;
  }

  async deleteSavingsGoal(id: number): Promise<void> {
    await db.delete(savingsGoals).where(eq(savingsGoals.id, id));
  }

  async getContributions(goalId: number): Promise<SavingsContribution[]> {
    return await db.select().from(savingsContributions).where(eq(savingsContributions.goalId, goalId));
  }

  async addContribution(contribution: Omit<SavingsContribution, "id" | "createdAt">): Promise<SavingsContribution> {
    const [newContribution] = await db.insert(savingsContributions).values(contribution).returning();

    await db.update(savingsGoals)
        .set({ currentAmount: sql`${savingsGoals.currentAmount} + ${contribution.amount}` })
        .where(eq(savingsGoals.id, contribution.goalId));

    return newContribution;
  }
}

export const storage = new DatabaseStorage();