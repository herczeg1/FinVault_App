import { db } from "./db";
import { users, accounts, categories, transactions, budgets } from "@shared/schema";
import bcrypt from "bcrypt";

async function seedDatabase() {
  console.log("Seeding database for 10 users...");

  // 1. Clear existing data to ensure a clean slate for 10 users
  // (Optional: depending on if we want to append or reset. User asked for "at least 10 users available")
  // Let's just check if we already have 10 users.
  const existingUsers = await db.select().from(users);
  if (existingUsers.length >= 10) {
    console.log("Database already has 10+ users. Skipping.");
    return;
  }

  // 2. Categories (Ensure they exist)
  const categoryData = [
    { name: "Transfer", icon: "arrow-right-left", colorHex: "#64748b" },
    { name: "Groceries", icon: "shopping-cart", colorHex: "#22c55e" },
    { name: "Salary", icon: "briefcase", colorHex: "#3b82f6" },
    { name: "Entertainment", icon: "film", colorHex: "#a855f7" },
    { name: "Rent", icon: "home", colorHex: "#f43f5e" },
    { name: "Utilities", icon: "zap", colorHex: "#eab308" },
    { name: "Dining", icon: "utensils", colorHex: "#f97316" },
    { name: "Transport", icon: "bus", colorHex: "#06b6d4" },
    { name: "Health", icon: "heart", colorHex: "#ec4899" },
    { name: "Shopping", icon: "shopping-bag", colorHex: "#8b5cf6" },
  ];
  
  // Use upsert or just insert if empty
  const existingCats = await db.select().from(categories);
  let insertedCategories = existingCats;
  if (existingCats.length === 0) {
    insertedCategories = await db.insert(categories).values(categoryData).returning();
  }
  
  const getCatId = (name: string) => insertedCategories.find(c => c.name === name)?.id || insertedCategories[0].id;

  // 3. Create 10 Users
  const userEmails = [
    "alice@finvault.io", "bob@finvault.io", "charlie@finvault.io",
    "david@finvault.io", "eve@finvault.io", "frank@finvault.io",
    "grace@finvault.io", "heidi@finvault.io", "ivan@finvault.io", "judy@finvault.io"
  ];

  for (const email of userEmails) {
    const existing = await db.select().from(users).where(sql`email = ${email}`);
    if (existing.length > 0) continue;

    const hashedPassword = await bcrypt.hash("demo1234", 10);
    const [user] = await db.insert(users).values({ email, password: hashedPassword }).returning();
    
    // Create 2-3 accounts per user
    const accs = await db.insert(accounts).values([
      { userId: user.id, name: "Main Checking", type: "Checking", balance: Math.floor(Math.random() * 1000000) },
      { userId: user.id, name: "Rainy Day Savings", type: "Savings", balance: Math.floor(Math.random() * 5000000) }
    ]).returning();

    // Create some transactions for the first account
    const mainAcc = accs[0];
    const txs = [
      { accountId: mainAcc.id, categoryId: getCatId("Salary"), amount: 300000, type: "credit", description: "Monthly Salary" },
      { accountId: mainAcc.id, categoryId: getCatId("Rent"), amount: 120000, type: "debit", description: "Apartment Rent" },
      { accountId: mainAcc.id, categoryId: getCatId("Groceries"), amount: 15000 + Math.floor(Math.random() * 5000), type: "debit", description: "Weekly Shop" },
      { accountId: mainAcc.id, categoryId: getCatId("Dining"), amount: 4500, type: "debit", description: "Dinner out" },
    ];
    await db.insert(transactions).values(txs);

    // Create a budget
    await db.insert(budgets).values({
      userId: user.id,
      categoryId: getCatId("Groceries"),
      limitAmount: 50000,
      period: "monthly"
    });
  }

  console.log("Seeding complete for 10 users!");
}

import { sql } from "drizzle-orm";
seedDatabase().catch(console.error);
