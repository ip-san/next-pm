import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

// Redmine piggybacks backup codes onto its generic multi-purpose `tokens` table (action =
// 'twofa_backup_code'); next-pm has no equivalent generic token table, so this is a small
// dedicated one instead. Also stores a hash, not the plaintext code — see backup-codes.ts.
export const twofaBackupCodes = pgTable("twofa_backup_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
