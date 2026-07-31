import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { workflowTransitions } from "@/infrastructure/db/schema/workflow-transitions";
import type { WorkflowTransition } from "@/domain/workflow/entity";
import type { WorkflowRepository } from "@/domain/workflow/repository";

function toDomain(row: typeof workflowTransitions.$inferSelect): WorkflowTransition {
  return {
    id: row.id,
    trackerId: row.trackerId,
    roleId: row.roleId,
    oldStatusId: row.oldStatusId,
    newStatusId: row.newStatusId,
    author: row.author,
    assignee: row.assignee,
  };
}

export class DrizzleWorkflowRepository implements WorkflowRepository {
  async listForTracker(trackerId: string): Promise<WorkflowTransition[]> {
    const rows = await db.select().from(workflowTransitions).where(eq(workflowTransitions.trackerId, trackerId));
    return rows.map(toDomain);
  }

  async create(transition: Omit<WorkflowTransition, "id">): Promise<WorkflowTransition> {
    const [row] = await db
      .insert(workflowTransitions)
      .values({
        trackerId: transition.trackerId,
        roleId: transition.roleId,
        oldStatusId: transition.oldStatusId,
        newStatusId: transition.newStatusId,
        author: transition.author,
        assignee: transition.assignee,
      })
      .returning();
    return toDomain(row);
  }
}
