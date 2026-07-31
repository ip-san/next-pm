import { or, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { issueRelations } from "@/infrastructure/db/schema/issue-relations";
import { normalizeRelation } from "@/domain/issue-relation/normalize";
import type { IssueRelation } from "@/domain/issue-relation/entity";
import type { IssueRelationRepository } from "@/domain/issue-relation/repository";

function toDomain(row: typeof issueRelations.$inferSelect): IssueRelation {
  return {
    id: row.id,
    issueFromId: row.issueFromId,
    issueToId: row.issueToId,
    relationType: row.relationType,
    delay: row.delay,
  };
}

export class DrizzleIssueRelationRepository implements IssueRelationRepository {
  async listForIssue(issueId: string): Promise<IssueRelation[]> {
    const rows = await db
      .select()
      .from(issueRelations)
      .where(or(eq(issueRelations.issueFromId, issueId), eq(issueRelations.issueToId, issueId)));
    return rows.map(toDomain);
  }

  async create(relation: Omit<IssueRelation, "id">): Promise<IssueRelation> {
    // Re-normalize defensively: callers should already pass canonical values, but this
    // keeps the invariant enforced at the one place rows actually get written.
    const normalized = normalizeRelation(relation);
    const [row] = await db
      .insert(issueRelations)
      .values({
        issueFromId: normalized.issueFromId,
        issueToId: normalized.issueToId,
        relationType: normalized.relationType,
        delay: normalized.delay,
      })
      .returning();
    return toDomain(row);
  }
}
