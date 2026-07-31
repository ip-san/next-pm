import { pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";

export const scmRepositories = pgTable(
  "scm_repositories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Absolute path to the repository's working copy — set by an admin, never derived from request input. */
    rootPath: text("root_path").notNull(),
  },
  (table) => [unique("scm_repositories_project_unique").on(table.projectId)],
);
