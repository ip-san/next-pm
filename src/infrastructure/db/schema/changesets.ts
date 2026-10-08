import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { scmRepositories } from "./scm-repositories";
import { users } from "./users";

export const changesets = pgTable(
  "changesets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scmRepositoryId: uuid("scm_repository_id")
      .notNull()
      .references(() => scmRepositories.id, { onDelete: "cascade" }),
    revision: text("revision").notNull(),
    committerIdentity: text("committer_identity").notNull(),
    /**
     * Mirrors Redmine's `changesets.user_id`, which IS the committer→user mapping: there is no
     * separate mapping table and nothing is stored on the repository. A commit's user is
     * resolved once on ingest (Changeset#before_create_cs), and re-pointing a committer at
     * someone else is a bulk update of this column over that repository's rows
     * (Repository#committer_ids=). Null means "no matching user", which is a normal state —
     * commits from people who never had an account.
     *
     * ON DELETE SET NULL rather than CASCADE: deleting a user must not delete the history of
     * what they committed.
     */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    committedOn: timestamp("committed_on", { withTimezone: true }).notNull(),
    comments: text("comments").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("changesets_repository_revision_unique").on(table.scmRepositoryId, table.revision),
    // The committer list and the remap both scan a repository's rows by committer string.
    index("changesets_repository_committer_idx").on(table.scmRepositoryId, table.committerIdentity),
  ],
);
