import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const userStatusEnum = ["active", "registered", "locked"] as const;

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  login: text("login").notNull().unique(),
  mail: text("mail").notNull().unique(),
  firstname: text("firstname").notNull(),
  lastname: text("lastname").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  status: text("status", { enum: userStatusEnum }).notNull().default("registered"),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  apiKey: text("api_key").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
