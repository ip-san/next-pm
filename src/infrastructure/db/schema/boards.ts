import { integer, pgTable, text, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { projects } from "./projects";

export const boards = pgTable("boards", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  /**
   * Board hierarchy (Redmine `acts_as_tree :dependent => :nullify`): deleting a parent board
   * promotes its children to the project's top level rather than destroying them.
   */
  parentId: uuid("parent_id").references((): AnyPgColumn => boards.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  /** 1-based and dense within (project_id, parent_id) — Redmine `acts_as_positioned :scope => [:project_id, :parent_id]`. */
  position: integer("position").notNull().default(0),
});
