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
  /**
   * Empty string for an LDAP-backed user (see authSource) — safe by construction, not just by
   * convention: verifyPassword compares buffer lengths before content, and Buffer.from("", "hex")
   * is zero-length against a real 64-byte scrypt digest, so it can never match any password.
   */
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  apiKey: text("api_key").unique(),
  /** Null for a locally-authenticated user; "ldap" delegates password checks to LDAP on every login. */
  authSource: text("auth_source", { enum: ["ldap"] }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
