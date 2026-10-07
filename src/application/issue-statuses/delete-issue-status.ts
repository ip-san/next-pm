import type { IssueStatusAdminRepository } from "@/domain/issue-status/repository";

export class IssueStatusNotDeletableError extends Error {}

/**
 * Mirrors IssueStatus#check_integrity: a status still carried by an issue, or still named as a
 * tracker's default status, cannot be deleted. The workflow rows that reference it go with it
 * (IssueStatus#delete_workflow_rules) rather than blocking the delete.
 */
export async function deleteIssueStatus(
  repositories: { issueStatusRepository: IssueStatusAdminRepository },
  statusId: string,
): Promise<void> {
  const { issueStatusRepository } = repositories;

  const issueCount = await issueStatusRepository.countIssuesUsing(statusId);
  if (issueCount > 0) {
    throw new IssueStatusNotDeletableError("このステータスのチケットがあるため削除できません。");
  }

  const trackerCount = await issueStatusRepository.countTrackersDefaultingTo(statusId);
  if (trackerCount > 0) {
    throw new IssueStatusNotDeletableError("既定のステータスとして使用しているトラッカーがあるため削除できません。");
  }

  await issueStatusRepository.delete(statusId);
}
