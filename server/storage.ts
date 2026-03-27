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

  getCategories(): Promise<Category[]>;
  getCategory(id: number): Promise<Category | undefined>;

  getTransactions(accountId: number): Promise<Transaction[]>;
  createTransaction(tx: Omit<Transaction, "id" | "date">): Promise<Transaction>;

  getBudgets(userId: number): Promise<Budget[]>;
  createBudget(budget: Omit<Budget, "id">): Promise<Budget>;

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

    // Update currentAmount on the goal
    await db.update(savingsGoals)
        .set({ currentAmount: sql`${savingsGoals.currentAmount} + ${contribution.amount}` })
        .where(eq(savingsGoals.id, contribution.goalId));

    return newContribution;
  }
}

export const storage = new DatabaseStorage();