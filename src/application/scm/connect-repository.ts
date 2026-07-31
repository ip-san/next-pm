import type { ScmRepository } from "@/domain/scm/entity";
import type { ScmRepositoryRepository } from "@/domain/scm/repository";

export class InvalidRepositoryError extends Error {}

export interface ConnectRepositoryInput {
  projectId: string;
  rootPath: string;
}

/** Registers the (admin-supplied, server-filesystem) path to an already-existing Git working copy. */
export async function connectRepository(
  repositories: { scmRepositoryRepository: ScmRepositoryRepository },
  input: ConnectRepositoryInput,
): Promise<ScmRepository> {
  if (input.rootPath.trim().length === 0) {
    throw new InvalidRepositoryError("リポジトリのパスを入力してください。");
  }
  if (!input.rootPath.startsWith("/")) {
    throw new InvalidRepositoryError("絶対パスを入力してください。");
  }

  const existing = await repositories.scmRepositoryRepository.findByProject(input.projectId);
  if (existing) {
    throw new InvalidRepositoryError("このプロジェクトには既にリポジトリが設定されています。");
  }

  return repositories.scmRepositoryRepository.create({ projectId: input.projectId, rootPath: input.rootPath });
}
