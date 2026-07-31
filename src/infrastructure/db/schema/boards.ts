import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";

export const boards = pgTable("boards", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  position: integer("position").notNull().default(0),
});
