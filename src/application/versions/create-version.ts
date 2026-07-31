import type { Version, VersionSharing } from "@/domain/version/entity";
import type { VersionRepository } from "@/domain/version/repository";

export class InvalidVersionError extends Error {}

const VERSION_SHARINGS: VersionSharing[] = ["none", "descendants", "hierarchy", "tree", "system"];

export interface CreateVersionInput {
  projectId: string;
  name: string;
  description: string;
  effectiveDate: string | null;
  sharing: VersionSharing;
  wikiPageTitle: string | null;
}

/** Mirrors Version's validates_presence_of :name, validates_length_of :name (max 60), :description/:wiki_page_title (max 255). */
export async function createVersion(repositories: { versionRepository: VersionRepository }, input: CreateVersionInput): Promise<Version> {
  if (input.name.trim().length === 0 || input.name.length > 60) {
    throw new InvalidVersionError("名前は1〜60文字で入力してください。");
  }
  if (input.description.length > 255) {
    throw new InvalidVersionError("説明は255文字以内で入力してください。");
  }
  if (input.wikiPageTitle && input.wikiPageTitle.length > 255) {
    throw new InvalidVersionError("Wikiページ名は255文字以内で入力してください。");
  }
  if (!VERSION_SHARINGS.includes(input.sharing)) {
    throw new InvalidVersionError("不正な共有設定です。");
  }

  const existing = await repositories.versionRepository.listByProject(input.projectId);
  if (existing.some((version) => version.name === input.name)) {
    throw new InvalidVersionError("同じ名前のバージョンが既に存在します。");
  }

  return repositories.versionRepository.create({
    projectId: input.projectId,
    name: input.name,
    description: input.description,
    effectiveDate: input.effectiveDate,
    status: "open",
    sharing: input.sharing,
    wikiPageTitle: input.wikiPageTitle,
  });
}
