import type { TrackerAdminRepository } from "@/domain/tracker/repository";

export class TrackerNotDeletableError extends Error {}

/**
 * Mirrors Tracker#check_integrity, which raises as soon as a single issue still uses the
 * tracker. The workflow rules, project assignments and custom-field assignments that hang off
 * the tracker go with it (Redmine declares them `dependent`), so only issues block the delete.
 */
export async function deleteTracker(
  repositories: { trackerAdminRepository: TrackerAdminRepository },
  trackerId: string,
): Promise<void> {
  const issueCount = await repositories.trackerAdminRepository.countIssuesUsing(trackerId);
  if (issueCount > 0) {
    throw new TrackerNotDeletableError("このトラッカーのチケットがあるため削除できません。");
  }

  await repositories.trackerAdminRepository.delete(trackerId);
}
