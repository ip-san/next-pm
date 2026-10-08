import { isScmRepositoryIdentifierFrozen, normalizeScmRepositoryIdentifier } from "@/domain/scm/identifier";
import type { ScmRepositoryRepository } from "@/domain/scm/repository";
import { assertAssignableIdentifier, InvalidRepositoryError } from "./connect-repository";

export interface UpdateRepositoryInput {
  scmRepositoryId: string;
  identifier: string;
  isDefault: boolean;
}

/**
 * Mirrors Redmine's RepositoriesController#update, whose `safe_attributes` deliberately narrow
 * what an existing repository still accepts:
 *
 * - `url` (next-pm's rootPath) is create-only (`safe_attributes 'url', if: new_record?`) — the
 *   stored changesets belong to that specific backend, so repointing a repository in place
 *   would silently reattribute them. Connect a second repository instead.
 * - the vendor is likewise fixed at create (Redmine picks the STI subclass from a separate
 *   `repository_scm` param and never reassigns `type`).
 * - a non-blank identifier is frozen (`identifier_frozen?`), because it is part of every URL
 *   already linked to. Redmine's setter ignores the write silently rather than erroring, and
 *   its form disables the field; both are mirrored here.
 */
export async function updateRepository(
  repositories: { scmRepositoryRepository: ScmRepositoryRepository },
  input: UpdateRepositoryInput,
): Promise<void> {
  const repository = await repositories.scmRepositoryRepository.findById(input.scmRepositoryId);
  if (!repository) {
    throw new InvalidRepositoryError("リポジトリが見つかりません。");
  }

  let identifier = repository.identifier;
  if (!isScmRepositoryIdentifierFrozen(repository.identifier)) {
    identifier = normalizeScmRepositoryIdentifier(input.identifier);
    const siblings = await repositories.scmRepositoryRepository.listByProject(repository.projectId);
    assertAssignableIdentifier(identifier, siblings, repository.id);
  }

  // `check_default` only clears the other rows when this save is the one turning the flag on;
  // unchecking the box on the current default just leaves the project without one (Redmine
  // never re-elects a default either — see domain/scm/repository.ts's findDefaultForProject,
  // which falls back to the first repository so browsing still works).
  if (input.isDefault && !repository.isDefault) {
    await repositories.scmRepositoryRepository.clearDefaultForProject(repository.projectId);
  }

  await repositories.scmRepositoryRepository.update(repository.id, { identifier, isDefault: input.isDefault });
}
