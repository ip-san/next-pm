import type { ScmRepository, ScmVendor } from "@/domain/scm/entity";
import type { ScmRepositoryRepository } from "@/domain/scm/repository";

export class InvalidRepositoryError extends Error {}

export interface ConnectRepositoryInput {
  projectId: string;
  vendor: ScmVendor;
  rootPath: string;
}

const SUBVERSION_URL_SCHEMES = ["file://", "http://", "https://", "svn://", "svn+ssh://"];

/**
 * Validates the admin-supplied repository location. git/mercurial are always browsed against a
 * local working copy on the app server's filesystem (an absolute path); Subversion is
 * centralized, so it's addressed by URL instead (mirrors Redmine's Repository::Subversion,
 * which stores a URL in the same `url` column git/mercurial store a filesystem path in).
 */
function validateRootPath(vendor: ScmVendor, rootPath: string): void {
  if (rootPath.trim().length === 0) {
    throw new InvalidRepositoryError("リポジトリのパスを入力してください。");
  }
  if (vendor === "subversion") {
    if (!SUBVERSION_URL_SCHEMES.some((scheme) => rootPath.startsWith(scheme))) {
      throw new InvalidRepositoryError("Subversionリポジトリの場合、URL（file://, http(s)://, svn(+ssh)://）を入力してください。");
    }
    return;
  }
  if (!rootPath.startsWith("/")) {
    throw new InvalidRepositoryError("絶対パスを入力してください。");
  }
}

/** Registers the (admin-supplied, server-filesystem or, for Subversion, URL-addressed) location of an already-existing repository. */
export async function connectRepository(
  repositories: { scmRepositoryRepository: ScmRepositoryRepository },
  input: ConnectRepositoryInput,
): Promise<ScmRepository> {
  validateRootPath(input.vendor, input.rootPath);

  const existing = await repositories.scmRepositoryRepository.findByProject(input.projectId);
  if (existing) {
    throw new InvalidRepositoryError("このプロジェクトには既にリポジトリが設定されています。");
  }

  return repositories.scmRepositoryRepository.create({ projectId: input.projectId, vendor: input.vendor, rootPath: input.rootPath });
}
