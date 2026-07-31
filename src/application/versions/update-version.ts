import type { Version, VersionStatus } from "@/domain/version/entity";
import type { VersionRepository } from "@/domain/version/repository";
import { InvalidVersionError } from "./create-version";

export interface UpdateVersionInput {
  versionId: string;
  name: string;
  description: string;
  effectiveDate: string | null;
  status: VersionStatus;
  wikiPageTitle: string | null;
}

const VERSION_STATUSES: VersionStatus[] = ["open", "locked", "closed"];

export async function updateVersion(repositories: { versionRepository: VersionRepository }, input: UpdateVersionInput): Promise<Version> {
  if (input.name.trim().length === 0 || input.name.length > 60) {
    throw new InvalidVersionError("名前は1〜60文字で入力してください。");
  }
  if (input.description.length > 255) {
    throw new InvalidVersionError("説明は255文字以内で入力してください。");
  }
  if (input.wikiPageTitle && input.wikiPageTitle.length > 255) {
    throw new InvalidVersionError("Wikiページ名は255文字以内で入力してください。");
  }
  if (!VERSION_STATUSES.includes(input.status)) {
    throw new InvalidVersionError("不正なステータスです。");
  }

  const version = await repositories.versionRepository.findById(input.versionId);
  if (!version) {
    throw new InvalidVersionError("バージョンが見つかりません。");
  }

  const siblings = await repositories.versionRepository.listByProject(version.projectId);
  if (siblings.some((sibling) => sibling.id !== input.versionId && sibling.name === input.name)) {
    throw new InvalidVersionError("同じ名前のバージョンが既に存在します。");
  }

  return repositories.versionRepository.update(input.versionId, {
    name: input.name,
    description: input.description,
    effectiveDate: input.effectiveDate,
    status: input.status,
    wikiPageTitle: input.wikiPageTitle,
  });
}
