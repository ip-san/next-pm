import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
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
    /**
     * Mirrors Repository#created_on's role in Changeset#scan_comment_for_issue_ids: commits
     * committed before this timestamp are still ingested and linked, but never trigger a
     * fix-keyword status change or time logging — otherwise connecting a repository with years
     * of history would replay every "fixes #123" against issues that were already resolved long
     * ago through the normal UI.
     */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("scm_repositories_project_unique").on(table.projectId)],
);
