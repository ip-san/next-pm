import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { scmRepositories } from "./scm-repositories";

export const changesets = pgTable(
  "changesets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scmRepositoryId: uuid("scm_repository_id")
      .notNull()
      .references(() => scmRepositories.id, { onDelete: "cascade" }),
    revision: text("revision").notNull(),
    committerIdentity: text("committer_identity").notNull(),
    committedOn: timestamp("committed_on", { withTimezone: true }).notNull(),
    comments: text("comments").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("changesets_repository_revision_unique").on(table.scmRepositoryId, table.revision)],
);
