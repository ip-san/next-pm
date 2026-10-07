import type { WorkflowFieldPermissionRepository, WorkflowRepository } from "@/domain/workflow/repository";

export interface CopyTrackerWorkflowRepositories {
  workflowRepository: WorkflowRepository;
  workflowFieldPermissionRepository: WorkflowFieldPermissionRepository;
}

/**
 * Mirrors `WorkflowRule.copy(source_tracker, nil, target_tracker, nil)`: for every role, the
 * target tracker's rules are replaced wholesale by the source tracker's rules for that role.
 * A role the source has no rules for ends up with none on the target either — Redmine's
 * copy_one deletes the target rows before inserting, so an empty source clears the target.
 *
 * Redmine keeps transitions and field permissions in one `workflows` table; here they are two,
 * so both are copied to reproduce the single `WorkflowRule.copy` call.
 */
export async function copyTrackerWorkflow(
  repositories: CopyTrackerWorkflowRepositories,
  sourceTrackerId: string,
  targetTrackerId: string,
): Promise<void> {
  if (sourceTrackerId === targetTrackerId) return;

  const { workflowRepository, workflowFieldPermissionRepository } = repositories;
  const [sourceTransitions, targetTransitions, sourcePermissions, targetPermissions] = await Promise.all([
    workflowRepository.listForTracker(sourceTrackerId),
    workflowRepository.listForTracker(targetTrackerId),
    workflowFieldPermissionRepository.listForTracker(sourceTrackerId),
    workflowFieldPermissionRepository.listForTracker(targetTrackerId),
  ]);

  // Roles the target already has rules for must be visited too, so that copying from a source
  // without rules for that role empties the target rather than leaving stale rows behind.
  const roleIds = new Set([
    ...sourceTransitions.map((t) => t.roleId),
    ...targetTransitions.map((t) => t.roleId),
    ...sourcePermissions.map((p) => p.roleId),
    ...targetPermissions.map((p) => p.roleId),
  ]);

  for (const roleId of roleIds) {
    await workflowRepository.replaceForTrackerAndRole(
      targetTrackerId,
      roleId,
      sourceTransitions
        .filter((t) => t.roleId === roleId)
        .map(({ oldStatusId, newStatusId, author, assignee }) => ({ oldStatusId, newStatusId, author, assignee })),
    );
    await workflowFieldPermissionRepository.replaceForTrackerAndRole(
      targetTrackerId,
      roleId,
      sourcePermissions.filter((p) => p.roleId === roleId).map(({ statusId, fieldName, rule }) => ({ statusId, fieldName, rule })),
    );
  }
}
