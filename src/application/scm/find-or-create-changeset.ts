import type { ChangesetRepository } from "@/domain/scm/changeset-repository";
import type { Changeset, ScmRepository } from "@/domain/scm/entity";
import type { ScmBrowser } from "@/domain/scm/scm-browser";
import type { UserRepository } from "@/domain/user/repository";
import { resolveCommitterUser } from "./resolve-committer-user";

export interface FindOrCreateChangesetRepositories {
  scmBrowser: ScmBrowser;
  changesetRepository: ChangesetRepository;
  userRepository: UserRepository;
}

/**
 * Returns the changeset row for a revision, materializing it from the SCM when it isn't stored
 * yet.
 *
 * Redmine always has the row: its repositories are fetched into `changesets` and the revision
 * page renders that record, so `find_changeset` is a plain lookup. next-pm's revision page
 * reads the SCM CLI directly and only stores what a sync has pulled in, so a perfectly valid
 * revision can have no row — and linking an issue to it needs one. Rather than force a full
 * sync (which would replay every commit message's keywords), this stores just that one commit.
 *
 * Deliberately does NOT run the commit-message keyword scan. The user is doing the linking by
 * hand; silently closing issues or logging time as a side effect of pressing "add" would be a
 * surprise, and a later full sync skips this revision anyway because the row now exists.
 *
 * `revision` may be abbreviated (the revision page accepts short hashes), so the row is keyed
 * on the full revision the SCM reports back, not on what the caller typed.
 */
export async function findOrCreateChangeset(
  repositories: FindOrCreateChangesetRepositories,
  scmRepository: ScmRepository,
  revision: string,
): Promise<Changeset | null> {
  const existing = await repositories.changesetRepository.findByRevision(scmRepository.id, revision);
  if (existing) return existing;

  const [commit] = await repositories.scmBrowser.log(scmRepository.rootPath, revision, 1);
  if (!commit) return null;

  const stored = await repositories.changesetRepository.findByRevision(scmRepository.id, commit.hash);
  if (stored) return stored;

  const committerIdentity = commit.authorEmail ? `${commit.author} <${commit.authorEmail}>` : commit.author;
  return repositories.changesetRepository.create({
    scmRepositoryId: scmRepository.id,
    revision: commit.hash,
    committerIdentity,
    userId: (await resolveCommitterUser(repositories, scmRepository.id, committerIdentity))?.id ?? null,
    committedOn: new Date(commit.date),
    comments: commit.message,
  });
}
