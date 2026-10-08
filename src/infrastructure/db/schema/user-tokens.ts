import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";
import { USER_TOKEN_ACTIONS } from "@/domain/user-token/entity";

/**
 * Redmine's generic `tokens` table, finally worth having: password-reset links got a dedicated
 * table (password_reset_tokens.ts) because they were the only purpose at the time, and this
 * change adds two more at once — the remember-me cookie and the self-registration activation
 * link. Both are bearer secrets mailed or stored in a cookie, so like password_reset_tokens
 * this stores a hash, never the value itself. Session rows live in user_sessions instead,
 * since those carry no secret.
 */
export const userTokens = pgTable("user_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  action: text("action", { enum: USER_TOKEN_ACTIONS }).notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
