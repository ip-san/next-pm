import type { VersionRepository } from "@/domain/version/repository";

export class VersionNotDeletableError extends Error {}

/** Mirrors Version#deletable? (simplified: no custom-field/attachment tracking on versions yet). */
export async function deleteVersion(repositories: { versionRepository: VersionRepository }, versionId: string): Promise<void> {
  const fixedIssueCount = await repositories.versionRepository.countFixedIssues(versionId);
  if (fixedIssueCount > 0) {
    throw new VersionNotDeletableError("このバージョンに割り当てられたチケットがあるため削除できません。");
  }

  await repositories.versionRepository.delete(versionId);
}
