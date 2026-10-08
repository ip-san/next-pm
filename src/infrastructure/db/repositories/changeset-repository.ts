import { and, desc, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { changesetIssues } from "@/infrastructure/db/schema/changeset-issues";
import { changesets } from "@/infrastructure/db/schema/changesets";
import type { CommitterMapping } from "@/domain/scm/committer";
import type { Changeset } from "@/domain/scm/entity";
import type { ChangesetRepository } from "@/domain/scm/changeset-repository";

function toDomain(row: typeof changesets.$inferSelect): Changeset {
  return {
    id: row.id,
    scmRepositoryId: row.scmRepositoryId,
    revision: row.revision,
    committerIdentity: row.committerIdentity,
    userId: row.userId,
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
        userId: changeset.userId,
        committedOn: changeset.committedOn,
        comments: changeset.comments,
      })
      .returning();
    return toDomain(row);
  }

  async linkIssue(changesetId: string, issueId: string): Promise<void> {
    await db.insert(changesetIssues).values({ changesetId, issueId }).onConflictDoNothing();
  }

  async unlinkIssue(changesetId: string, issueId: string): Promise<void> {
    await db
      .delete(changesetIssues)
      .where(and(eq(changesetIssues.changesetId, changesetId), eq(changesetIssues.issueId, issueId)));
  }

  async listIssueIds(changesetId: string): Promise<string[]> {
    const rows = await db
      .select({ issueId: changesetIssues.issueId })
      .from(changesetIssues)
      .where(eq(changesetIssues.changesetId, changesetId));
    return rows.map((row) => row.issueId);
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

  async listByScmRepository(scmRepositoryId: string): Promise<Changeset[]> {
    const rows = await db
      .select()
      .from(changesets)
      .where(eq(changesets.scmRepositoryId, scmRepositoryId))
      .orderBy(desc(changesets.committedOn));
    return rows.map(toDomain);
  }

  async listCommitters(scmRepositoryId: string): Promise<CommitterMapping[]> {
    const rows = await db
      .selectDistinct({ committerIdentity: changesets.committerIdentity, userId: changesets.userId })
      .from(changesets)
      .where(eq(changesets.scmRepositoryId, scmRepositoryId))
      .orderBy(changesets.committerIdentity);
    return rows;
  }

  async findLatestByCommitter(scmRepositoryId: string, committerIdentity: string): Promise<Changeset | null> {
    // committed_on DESC, id DESC — the ordering Redmine's `has_many :changesets` declares, which
    // is what makes "the existing mapping" mean the newest commit by that committer.
    const [row] = await db
      .select()
      .from(changesets)
      .where(and(eq(changesets.scmRepositoryId, scmRepositoryId), eq(changesets.committerIdentity, committerIdentity)))
      .orderBy(desc(changesets.committedOn), desc(changesets.id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async remapCommitter(scmRepositoryId: string, committerIdentity: string, userId: string | null): Promise<void> {
    await db
      .update(changesets)
      .set({ userId })
      .where(and(eq(changesets.scmRepositoryId, scmRepositoryId), eq(changesets.committerIdentity, committerIdentity)));
  }
}
