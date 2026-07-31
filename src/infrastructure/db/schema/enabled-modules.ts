import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";

export const enabledModules = pgTable("enabled_modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
});
