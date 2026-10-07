import type { ScmRepository, ScmVendor } from "@/domain/scm/entity";
import {
  normalizeScmRepositoryIdentifier,
  validateScmRepositoryIdentifier,
  type ScmRepositoryIdentifierProblem,
} from "@/domain/scm/identifier";
import type { ScmRepositoryRepository } from "@/domain/scm/repository";

export class InvalidRepositoryError extends Error {}

export interface ConnectRepositoryInput {
  projectId: string;
  /** Raw form input; normalized (trimmed) and validated here, as Redmine's before_validation does. */
  identifier: string;
  vendor: ScmVendor;
  rootPath: string;
  isDefault: boolean;
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

const IDENTIFIER_PROBLEM_MESSAGE: Record<ScmRepositoryIdentifierProblem, string> = {
  too_long: "識別子は255文字以内で入力してください。",
  malformed: "識別子は英小文字・数字・ハイフン・アンダースコアのみ、数字だけの文字列は不可です。",
  reserved: "この識別子はリポジトリのURLで予約されているため使用できません。",
};

/** Shared by connect/update — Redmine's format/length/exclusion validations plus the per-project uniqueness. */
export function assertAssignableIdentifier(identifier: string, siblings: { id: string; identifier: string }[], selfId: string | null): void {
  const problem = validateScmRepositoryIdentifier(identifier);
  if (problem) {
    throw new InvalidRepositoryError(IDENTIFIER_PROBLEM_MESSAGE[problem]);
  }
  // Redmine's `validates_uniqueness_of :identifier, scope: :project_id` carries no allow_blank,
  // so the blank identifier is unique too — a project may hold at most one unnamed repository.
  if (siblings.some((sibling) => sibling.id !== selfId && sibling.identifier === identifier)) {
    throw new InvalidRepositoryError(
      identifier.length === 0
        ? "識別子を持たないリポジトリは、1プロジェクトにつき1つまでです。"
        : "この識別子のリポジトリは既に存在します。",
    );
  }
}

/**
 * Registers the (admin-supplied, server-filesystem or, for Subversion, URL-addressed) location
 * of an already-existing repository. A project may hold several, each addressed by its
 * identifier — mirrors Redmine's RepositoriesController#create.
 */
export async function connectRepository(
  repositories: { scmRepositoryRepository: ScmRepositoryRepository },
  input: ConnectRepositoryInput,
): Promise<ScmRepository> {
  validateRootPath(input.vendor, input.rootPath);

  const identifier = normalizeScmRepositoryIdentifier(input.identifier);
  const siblings = await repositories.scmRepositoryRepository.listByProject(input.projectId);
  assertAssignableIdentifier(identifier, siblings, null);

  // Redmine's `set_as_default?` + `check_default`: a project's first repository is forced to be
  // the default even when the form left the box unchecked, and promoting a new default demotes
  // whichever one held the flag before.
  const isDefault = siblings.length === 0 ? true : input.isDefault;
  if (isDefault) {
    await repositories.scmRepositoryRepository.clearDefaultForProject(input.projectId);
  }

  return repositories.scmRepositoryRepository.create({
    projectId: input.projectId,
    identifier,
    isDefault,
    vendor: input.vendor,
    rootPath: input.rootPath,
  });
}
