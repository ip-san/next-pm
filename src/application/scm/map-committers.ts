import type { ChangesetRepository } from "@/domain/scm/changeset-repository";
import type { CommitterMapping } from "@/domain/scm/committer";

export interface MapCommittersRepositories {
  changesetRepository: ChangesetRepository;
}

export interface MapCommittersInput {
  scmRepositoryId: string;
  /** Submitted committer → user pairs. A null user id unmaps that committer. */
  assignments: CommitterMapping[];
}

/**
 * Redmine's `Repository#committer_ids=`. It walks the repository's *existing* committer list
 * and only acts on entries whose submitted user differs from the one already stored, so:
 *
 * - a committer string that isn't in the repository is ignored, never inserted (the mapping is
 *   derived from the commits that exist, so there is nothing to map it onto);
 * - a committer the form didn't submit keeps whatever it had;
 * - an unchanged pair costs no write at all.
 *
 * The rewrite is retroactive over that repository's changesets and nothing else: journals and
 * time entries the commit keywords already produced keep their original user, matching
 * Redmine's bulk `update_all`. Future commits by the same committer pick the new user up
 * through resolve-committer-user.ts's first branch.
 *
 * Returns the committer strings that were actually re-pointed.
 */
export async function mapCommitters(repositories: MapCommittersRepositories, input: MapCommittersInput): Promise<string[]> {
  const current = await repositories.changesetRepository.listCommitters(input.scmRepositoryId);
  const submitted = new Map(input.assignments.map((assignment) => [assignment.committerIdentity, assignment.userId]));

  const remapped: string[] = [];
  for (const { committerIdentity, userId } of current) {
    if (!submitted.has(committerIdentity)) continue;
    const next = submitted.get(committerIdentity) ?? null;
    if (next === userId) continue;
    await repositories.changesetRepository.remapCommitter(input.scmRepositoryId, committerIdentity, next);
    remapped.push(committerIdentity);
  }
  return remapped;
}
