import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'Checking', 'Savings', 'Credit'
  balance: integer("balance").notNull().default(0), // in cents
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
  colorHex: text("color_hex").notNull(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  categoryId: integer("category_id").notNull(),
  amount: integer("amount").notNull(), // cents
  type: text("type").notNull(), // 'credit', 'debit'
  description: text("description").notNull(),
  date: timestamp("date").defaultNow(),
});

export const budgets = pgTable("budgets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  categoryId: integer("category_id").notNull(),
  limitAmount: integer("limit_amount").notNull(), // cents
  period: text("period").notNull(), // 'monthly', 'weekly'
});

export const savingsGoals = pgTable("savings_goals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  targetAmount: integer("target_amount").notNull(), // cents
  currentAmount: integer("current_amount").notNull().default(0), // cents
  deadline: timestamp("deadline"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const savingsContributions = pgTable("savings_contributions", {
  id: serial("id").primaryKey(),
  goalId: integer("goal_id").notNull().references(() => savingsGoals.id),
  amount: integer("amount").notNull(), // cents
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertAccountSchema = createInsertSchema(accounts).omit({ id: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, date: true });
export const insertBudgetSchema = createInsertSchema(budgets).omit({ id: true });
export const insertSavingsGoalSchema = createInsertSchema(savingsGoals).omit({ id: true, createdAt: true, currentAmount: true });
export const insertSavingsContributionSchema = createInsertSchema(savingsContributions).omit({ id: true, createdAt: true });

export type User = typeof users.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type SavingsGoal = typeof savingsGoals.$inferSelect;
export type SavingsContribution = typeof savingsContributions.$inferSelect;