import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

// Redmine piggybacks lost-password links onto its generic multi-purpose `tokens` table
// (action = 'recovery'); next-pm has no equivalent generic token table, so this is a small
// dedicated one instead — same idiom as twofa_backup_codes. Stores a hash of the token, not
// the plaintext, since this is a short-TTL bearer secret mailed as a URL.
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
