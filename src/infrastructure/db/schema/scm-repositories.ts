import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";

export const scmRepositories = pgTable(
  "scm_repositories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /**
     * Mirrors Redmine's Repository#identifier — the URL-safe name that distinguishes one of a
     * project's repositories from the others (`/projects/foo/repository/docs/...`). Redmine
     * stores NULL for the one repository a project may keep unnamed; this column uses the empty
     * string instead so the (project_id, identifier) unique constraint actually rejects a second
     * unnamed repository, which a nullable column would silently allow (NULLs never collide).
     */
    identifier: text("identifier").notNull().default(""),
    /**
     * Redmine's Repository#is_default — the repository served at the bare
     * `/projects/:identifier/repository` path. Exactly one per project, enforced by the partial
     * unique index below (Redmine enforces it only in a before_save callback).
     */
    isDefault: boolean("is_default").notNull().default(false),
    /** "git" | "subversion" | "mercurial" — see domain/scm/entity.ts's ScmVendor. Defaults to "git" so existing rows need no backfill. */
    vendor: text("vendor").notNull().default("git"),
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
  (table) => [
    unique("scm_repositories_project_identifier_unique").on(table.projectId, table.identifier),
    uniqueIndex("scm_repositories_project_default_unique")
      .on(table.projectId)
      .where(sql`${table.isDefault}`),
  ],
);
