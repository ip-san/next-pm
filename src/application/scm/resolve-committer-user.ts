import type { ChangesetRepository } from "@/domain/scm/changeset-repository";
import { parseCommitterIdentity } from "@/domain/scm/committer";
import type { User } from "@/domain/user/entity";
import type { UserRepository } from "@/domain/user/repository";

export interface ResolveCommitterUserRepositories {
  changesetRepository: ChangesetRepository;
  userRepository: UserRepository;
}

/**
 * Redmine's `Repository#find_committer_user`, in its exact order:
 *
 *   1. a blank committer resolves to nobody;
 *   2. the repository's newest changeset with that *exact* committer string, if it already
 *      carries a user — this is what makes an admin's manual mapping stick for every commit
 *      that arrives afterwards, without any mapping table. Note Redmine looks only at that one
 *      newest row: if it is unmapped, it does not search older ones, it falls through;
 *   3. otherwise parse "name <email>" and match a user by login, then by email.
 *
 * Two deliberate differences from Redmine, both narrower rather than wider:
 * - Login matching is exact. Redmine's `User.find_by_login` tries an exact match and then falls
 *   back to a case-insensitive one; next-pm's `findByLogin` is the same method its password
 *   login uses, and loosening that for the sake of commit attribution is not a trade worth
 *   making. A committer whose name differs from their login only by case stays unmapped until
 *   an admin maps them on the committers screen — which then sticks via step 2.
 * - Redmine applies no status filter here, so a locked user can be matched; that is preserved
 *   (the mapping is a record of who wrote the commit, not a grant of any access).
 */
export async function resolveCommitterUser(
  repositories: ResolveCommitterUserRepositories,
  scmRepositoryId: string,
  committerIdentity: string,
): Promise<User | null> {
  if (committerIdentity.trim().length === 0) return null;

  const latest = await repositories.changesetRepository.findLatestByCommitter(scmRepositoryId, committerIdentity);
  if (latest?.userId) {
    return repositories.userRepository.findById(latest.userId);
  }

  const parsed = parseCommitterIdentity(committerIdentity);
  if (!parsed) return null;

  const byLogin = await repositories.userRepository.findByLogin(parsed.username);
  if (byLogin) return byLogin;

  return parsed.email ? repositories.userRepository.findByMail(parsed.email) : null;
}
