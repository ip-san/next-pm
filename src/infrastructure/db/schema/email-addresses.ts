import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Redmine's `email_addresses` table, with one deliberate difference: Redmine moved the address
 * out of `users` entirely and flags one row `is_default`, whereas next-pm keeps `users.mail`
 * as the default address and uses this table only for the *additional* ones.
 *
 * The reason is blast radius. `users.mail` is NOT NULL and UNIQUE, and is read by the mail
 * handler, the notification job, the REST API, the seed and every user listing; moving it
 * would touch all of them for no behavioural gain, since Redmine's own `User#mail` is just
 * "the default row's address". What this does cost is that uniqueness spans two tables and so
 * cannot be a database constraint — every write path (registration, the my-account address
 * change, the admin user form, adding an address here) has to check both, and
 * DrizzleUserRepository.findByMail searches both so that lookups can't miss one.
 */
export const emailAddresses = pgTable("email_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  address: text("address").notNull().unique(),
  /** Redmine's EmailAddress#notify — whether notifications are also delivered to this address. */
  notify: boolean("notify").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
