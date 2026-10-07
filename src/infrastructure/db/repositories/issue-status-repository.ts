import { count, eq, or } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { issues } from "@/infrastructure/db/schema/issues";
import { issueStatuses } from "@/infrastructure/db/schema/issue-statuses";
import { trackers } from "@/infrastructure/db/schema/trackers";
import { workflowFieldPermissions } from "@/infrastructure/db/schema/workflow-field-permissions";
import { workflowTransitions } from "@/infrastructure/db/schema/workflow-transitions";
import type { Positioned } from "@/domain/ordering/positioned";
import type { IssueStatus } from "@/domain/issue-status/entity";
import type { IssueStatusAdminRepository, IssueStatusRepository } from "@/domain/issue-status/repository";

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

export class DrizzleIssueStatusRepository implements IssueStatusRepository, IssueStatusAdminRepository {
  async findById(id: string): Promise<IssueStatus | null> {
    const [row] = await db.select().from(issueStatuses).where(eq(issueStatuses.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async listAll(): Promise<IssueStatus[]> {
    // The id tiebreak matters because every row a create inserted before reordering existed
    // shares position 0 — without it the list order would vary between requests.
    const rows = await db.select().from(issueStatuses).orderBy(issueStatuses.position, issueStatuses.id);
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

  async update(
    id: string,
    changes: Pick<IssueStatus, "name" | "description" | "isClosed" | "defaultDoneRatio">,
  ): Promise<IssueStatus> {
    const [row] = await db.update(issueStatuses).set(changes).where(eq(issueStatuses.id, id)).returning();
    return toDomain(row);
  }

  async delete(id: string): Promise<void> {
    // workflow_transitions / workflow_field_permissions both cascade on their status FKs, which
    // already gives IssueStatus#delete_workflow_rules' effect — the explicit deletes keep the
    // intent visible at this layer rather than hiding it in a schema detail.
    await db
      .delete(workflowTransitions)
      .where(or(eq(workflowTransitions.oldStatusId, id), eq(workflowTransitions.newStatusId, id)));
    await db.delete(workflowFieldPermissions).where(eq(workflowFieldPermissions.statusId, id));
    await db.delete(issueStatuses).where(eq(issueStatuses.id, id));
  }

  async countIssuesUsing(id: string): Promise<number> {
    const [row] = await db.select({ value: count() }).from(issues).where(eq(issues.statusId, id));
    return row?.value ?? 0;
  }

  async countTrackersDefaultingTo(id: string): Promise<number> {
    const [row] = await db.select({ value: count() }).from(trackers).where(eq(trackers.defaultStatusId, id));
    return row?.value ?? 0;
  }

  async updatePositions(positions: Positioned[]): Promise<void> {
    for (const { id, position } of positions) {
      await db.update(issueStatuses).set({ position }).where(eq(issueStatuses.id, id));
    }
  }
}
