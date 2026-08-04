import { and, desc, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { changesetIssues } from "@/infrastructure/db/schema/changeset-issues";
import { changesets } from "@/infrastructure/db/schema/changesets";
import type { Changeset } from "@/domain/scm/entity";
import type { ChangesetRepository } from "@/domain/scm/changeset-repository";

function toDomain(row: typeof changesets.$inferSelect): Changeset {
  return {
    id: row.id,
    scmRepositoryId: row.scmRepositoryId,
    revision: row.revision,
    committerIdentity: row.committerIdentity,
    committedOn: row.committedOn,
    comments: row.comments,
    createdAt: row.createdAt,
  };
}

export class DrizzleChangesetRepository implements ChangesetRepository {
  async findByRevision(scmRepositoryId: string, revision: string): Promise<Changeset | null> {
    const [row] = await db
      .select()
      .from(changesets)
      .where(and(eq(changesets.scmRepositoryId, scmRepositoryId), eq(changesets.revision, revision)))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async create(changeset: Omit<Changeset, "id" | "createdAt">): Promise<Changeset> {
    const [row] = await db
      .insert(changesets)
      .values({
        scmRepositoryId: changeset.scmRepositoryId,
        revision: changeset.revision,
        committerIdentity: changeset.committerIdentity,
        committedOn: changeset.committedOn,
        comments: changeset.comments,
      })
      .returning();
    return toDomain(row);
  }

  async linkIssue(changesetId: string, issueId: string): Promise<void> {
    await db.insert(changesetIssues).values({ changesetId, issueId }).onConflictDoNothing();
  }

  async listForIssue(issueId: string): Promise<Changeset[]> {
    const rows = await db
      .select({ changeset: changesets })
      .from(changesetIssues)
      .innerJoin(changesets, eq(changesetIssues.changesetId, changesets.id))
      .where(eq(changesetIssues.issueId, issueId))
      .orderBy(desc(changesets.committedOn));
    return rows.map((row) => toDomain(row.changeset));
  }
}
