import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { issueStatuses } from "@/infrastructure/db/schema/issue-statuses";
import type { IssueStatus } from "@/domain/issue-status/entity";
import type { IssueStatusRepository } from "@/domain/issue-status/repository";

function toDomain(row: typeof issueStatuses.$inferSelect): IssueStatus {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isClosed: row.isClosed,
    defaultDoneRatio: row.defaultDoneRatio,
    position: row.position,
  };
}

export class DrizzleIssueStatusRepository implements IssueStatusRepository {
  async findById(id: string): Promise<IssueStatus | null> {
    const [row] = await db.select().from(issueStatuses).where(eq(issueStatuses.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async listAll(): Promise<IssueStatus[]> {
    const rows = await db.select().from(issueStatuses).orderBy(issueStatuses.position);
    return rows.map(toDomain);
  }

  async create(status: Omit<IssueStatus, "id">): Promise<IssueStatus> {
    const [row] = await db
      .insert(issueStatuses)
      .values({
        name: status.name,
        description: status.description,
        isClosed: status.isClosed,
        defaultDoneRatio: status.defaultDoneRatio,
        position: status.position,
      })
      .returning();
    return toDomain(row);
  }
}
