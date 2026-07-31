import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { customFields } from "./custom-fields";

export const customValues = pgTable(
  "custom_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customFieldId: uuid("custom_field_id")
      .notNull()
      .references(() => customFields.id, { onDelete: "cascade" }),
    /** Polymorphic target discriminator (Issue today) — same caveat as journals.journalizedType. */
    customizedType: text("customized_type").notNull(),
    customizedId: uuid("customized_id").notNull(),
    value: text("value"),
  },
  (table) => [uniqueIndex("custom_values_unique_target").on(table.customFieldId, table.customizedType, table.customizedId)],
);
