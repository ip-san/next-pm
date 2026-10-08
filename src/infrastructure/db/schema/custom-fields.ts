import { boolean, integer, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { trackers } from "./trackers";

export const customFieldFormatEnum = ["string", "text", "int", "float", "date", "bool", "list", "link", "user", "version", "enumeration"] as const;
export const customizedTypeEnum = ["Issue", "Project", "TimeEntry"] as const;

export const customFields = pgTable("custom_fields", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  customizedType: text("customized_type", { enum: customizedTypeEnum }).notNull().default("Issue"),
  fieldFormat: text("field_format", { enum: customFieldFormatEnum }).notNull(),
  isRequired: boolean("is_required").notNull().default(false),
  defaultValue: text("default_value"),
  possibleValues: jsonb("possible_values").notNull().$type<string[]>().default([]),
  position: integer("position").notNull().default(0),
});

/**
 * Redmine's CustomFieldEnumeration: the choices of an `enumeration` custom field. A value stores the
 * choice's id. Removing a choice deactivates it instead of deleting it, so existing values keep their
 * name (Redmine's `active` flag on the same rows).
 */
export const customFieldEnumerations = pgTable("custom_field_enumerations", {
  id: uuid("id").primaryKey().defaultRandom(),
  customFieldId: uuid("custom_field_id")
    .notNull()
    .references(() => customFields.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  active: boolean("active").notNull().default(true),
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
