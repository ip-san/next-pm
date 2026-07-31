import { boolean, integer, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { trackers } from "./trackers";

export const customFieldFormatEnum = ["string", "text", "int", "float", "date", "bool", "list"] as const;

export const customFields = pgTable("custom_fields", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  fieldFormat: text("field_format", { enum: customFieldFormatEnum }).notNull(),
  isRequired: boolean("is_required").notNull().default(false),
  defaultValue: text("default_value"),
  possibleValues: jsonb("possible_values").notNull().$type<string[]>().default([]),
  position: integer("position").notNull().default(0),
});

export const customFieldsTrackers = pgTable(
  "custom_fields_trackers",
  {
    customFieldId: uuid("custom_field_id")
      .notNull()
      .references(() => customFields.id, { onDelete: "cascade" }),
    trackerId: uuid("tracker_id")
      .notNull()
      .references(() => trackers.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.customFieldId, table.trackerId] })],
);
