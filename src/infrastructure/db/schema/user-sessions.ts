import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Server-side counterpart to the session JWT (infrastructure/auth/session-token.ts), which
 * carries this row's id. A stateless token alone cannot express the three things Redmine's
 * `Token` with `action = 'session'` gives it:
 *
 * - `session_lifetime` — absolute expiry measured from `createdAt`, honoured even if an admin
 *   shortens the setting after the token was minted;
 * - `session_timeout` — idle expiry measured from `lastActiveAt`, which a Server Component can
 *   bump with a DB write (it cannot re-issue a cookie, so a claim inside the JWT could not be);
 * - logging every device out on a password change (Redmine's User#destroy_tokens), which is
 *   impossible while the only proof of a session is a signature the server never recorded.
 *
 * No secret lives here: the row id is only reachable through a signed JWT, so unlike
 * user_tokens there is nothing to hash.
 */
export const userSessions = pgTable("user_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** Bumped at most once a minute by the resolver — same throttle as Redmine's User#update_last_login_on!. */
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
});
