import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { customFields } from "./custom-fields";

export const customValues = pgTable(
  "custom_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customFieldId: uuid("custom_field_id")
      .notNull()
      .references(() => customFields.id, { onDelete: "cascade" }),
    /** Polymorphic target discriminator — same shape as journals.journalizedType. */
    customizedType: text("customized_type").notNull(),
    customizedId: uuid("customized_id").notNull(),
    value: text("value"),
  },
  // Not unique: a multiple-valued field keeps one row per value (Redmine's custom_values has no uniqueness either).
  (table) => [index("custom_values_target").on(table.customFieldId, table.customizedType, table.customizedId)],
);
