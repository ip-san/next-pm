import type { WorkflowFieldPermissionRepository, WorkflowRepository } from "@/domain/workflow/repository";

export interface CopyRoleWorkflowRepositories {
  workflowRepository: WorkflowRepository;
  workflowFieldPermissionRepository: WorkflowFieldPermissionRepository;
}

/**
 * Mirrors `WorkflowRule.copy(nil, source_role, nil, target_role)`: for every tracker, the
 * target role's rules are replaced wholesale by the source role's rules for that tracker.
 * Copying from a role with no rules for a tracker therefore clears the target there.
 *
 * `trackerIds` is passed in rather than looked up because the caller already has the list and
 * the workflow repositories are keyed on (tracker, role) pairs, not on a role alone.
 */
export async function copyRoleWorkflow(
  repositories: CopyRoleWorkflowRepositories,
  trackerIds: string[],
  sourceRoleId: string,
  targetRoleId: string,
): Promise<void> {
  if (sourceRoleId === targetRoleId) return;

  const { workflowRepository, workflowFieldPermissionRepository } = repositories;
  for (const trackerId of trackerIds) {
    const [transitions, permissions] = await Promise.all([
      workflowRepository.listForTrackerAndRole(trackerId, sourceRoleId),
      workflowFieldPermissionRepository.listForTrackerAndRole(trackerId, sourceRoleId),
    ]);
    await workflowRepository.replaceForTrackerAndRole(
      trackerId,
      targetRoleId,
      transitions.map(({ oldStatusId, newStatusId, author, assignee }) => ({
        oldStatusId,
        newStatusId,
        author,
        assignee,
      })),
    );
    await workflowFieldPermissionRepository.replaceForTrackerAndRole(
      trackerId,
      targetRoleId,
      permissions.map(({ statusId, fieldName, rule }) => ({ statusId, fieldName, rule })),
    );
  }
}
