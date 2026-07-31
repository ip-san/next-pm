import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { users } from "./users";

export const issueCategories = pgTable("issue_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  assignedToId: uuid("assigned_to_id").references(() => users.id),
});
