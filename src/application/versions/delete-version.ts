import type { AttachmentRepository } from "@/domain/attachment/repository";
import type { VersionRepository } from "@/domain/version/repository";

export class VersionNotDeletableError extends Error {}

/** Mirrors Version#deletable? — fixed_issues.empty? && attachments.empty? (no version custom fields yet). */
export async function deleteVersion(
  repositories: { versionRepository: VersionRepository; attachmentRepository: AttachmentRepository },
  versionId: string,
): Promise<void> {
  const fixedIssueCount = await repositories.versionRepository.countFixedIssues(versionId);
  if (fixedIssueCount > 0) {
    throw new VersionNotDeletableError("このバージョンに割り当てられたチケットがあるため削除できません。");
  }

  // The Files module hangs releases off versions; deleting the version would orphan both the
  // rows and the files on disk, so Redmine refuses instead of cascading.
  const files = await repositories.attachmentRepository.listByContainer("Version", versionId);
  if (files.length > 0) {
    throw new VersionNotDeletableError("このバージョンにファイルが登録されているため削除できません。");
  }

  await repositories.versionRepository.delete(versionId);
}
