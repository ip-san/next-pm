import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const journals = pgTable("journals", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Polymorphic target discriminator (Issue today; WikiPage/News join later phases) — see plan's CustomValue caveat. */
  journalizedType: text("journalized_type").notNull(),
  journalizedId: uuid("journalized_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const journalDetails = pgTable("journal_details", {
  id: uuid("id").primaryKey().defaultRandom(),
  journalId: uuid("journal_id")
    .notNull()
    .references(() => journals.id, { onDelete: "cascade" }),
  property: text("property", { enum: ["attr", "cf", "relation"] }).notNull(),
  fieldName: text("field_name").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
});
