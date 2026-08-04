import { pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { changesets } from "./changesets";
import { issues } from "./issues";

// Mirrors Redmine's changesets_issues join table — which issues a commit references, regardless
// of whether the reference also triggered a status change or time log.
export const changesetIssues = pgTable(
  "changeset_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    changesetId: uuid("changeset_id")
      .notNull()
      .references(() => changesets.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
  },
  (table) => [unique("changeset_issues_unique").on(table.changesetId, table.issueId)],
);
