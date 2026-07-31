import { boolean, integer, pgTable, text, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

export const projectStatusEnum = ["active", "closed", "archived"] as const;

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  identifier: text("identifier").notNull().unique(),
  description: text("description").notNull().default(""),
  isPublic: boolean("is_public").notNull().default(true),
  status: text("status", { enum: projectStatusEnum }).notNull().default("active"),
  parentId: uuid("parent_id").references((): AnyPgColumn => projects.id, { onDelete: "restrict" }),
  /** Nested-set bounds (Redmine's awesome_nested_set columns), maintained by domain/project/nested-set.ts. */
  lft: integer("lft").notNull(),
  rgt: integer("rgt").notNull(),
  position: integer("position").notNull().default(0),
});
