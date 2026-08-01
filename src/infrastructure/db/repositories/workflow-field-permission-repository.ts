import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { workflowFieldPermissions } from "@/infrastructure/db/schema/workflow-field-permissions";
import type { WorkflowFieldPermission } from "@/domain/workflow/entity";
import type { WorkflowFieldPermissionRepository } from "@/domain/workflow/repository";

function toDomain(row: typeof workflowFieldPermissions.$inferSelect): WorkflowFieldPermission {
  return {
    id: row.id,
    trackerId: row.trackerId,
    roleId: row.roleId,
    statusId: row.statusId,
    fieldName: row.fieldName as WorkflowFieldPermission["fieldName"],
    rule: row.rule,
  };
}

export class DrizzleWorkflowFieldPermissionRepository implements WorkflowFieldPermissionRepository {
  async listForTracker(trackerId: string): Promise<WorkflowFieldPermission[]> {
    const rows = await db
      .select()
      .from(workflowFieldPermissions)
      .where(eq(workflowFieldPermissions.trackerId, trackerId));
    return rows.map(toDomain);
  }

  async listForTrackerAndRole(trackerId: string, roleId: string): Promise<WorkflowFieldPermission[]> {
    const rows = await db
      .select()
      .from(workflowFieldPermissions)
      .where(and(eq(workflowFieldPermissions.trackerId, trackerId), eq(workflowFieldPermissions.roleId, roleId)));
    return rows.map(toDomain);
  }

  async replaceForTrackerAndRole(
    trackerId: string,
    roleId: string,
    permissions: Array<Omit<WorkflowFieldPermission, "id" | "trackerId" | "roleId">>,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .delete(workflowFieldPermissions)
        .where(and(eq(workflowFieldPermissions.trackerId, trackerId), eq(workflowFieldPermissions.roleId, roleId)));
      if (permissions.length > 0) {
        await tx.insert(workflowFieldPermissions).values(
          permissions.map((p) => ({
            trackerId,
            roleId,
            statusId: p.statusId,
            fieldName: p.fieldName,
            rule: p.rule,
          })),
        );
      }
    });
  }
}
