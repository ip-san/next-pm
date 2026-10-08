import { boolean, integer, pgTable, text, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { projects } from "./projects";

export const enumerationTypeEnum = ["IssuePriority", "TimeEntryActivity", "DocumentCategory"] as const;

/**
 * Mirrors Redmine's single-table `enumerations` (IssuePriority/TimeEntryActivity/...): a
 * project-scoped row (project_id set) can override a system-wide default row (project_id
 * null) via parent_id, matching the acts_as_tree override semantics confirmed in
 * redmine/app/models/enumeration.rb.
 */
export const enumerations = pgTable("enumerations", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type", { enum: enumerationTypeEnum }).notNull(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  isDefault: integer("is_default").notNull().default(0),
  /**
   * Redmine's `enumerations.active`. For a project override row it is the whole point of
   * the row: a project deactivates a system-wide time-entry activity by owning a child of
   * it with active = false.
   */
  active: boolean("active").notNull().default(true),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => enumerations.id, { onDelete: "cascade" }),
});
