import type { CommitterMapping } from "./committer";
import type { Changeset } from "./entity";

export interface ChangesetRepository {
  findByRevision(scmRepositoryId: string, revision: string): Promise<Changeset | null>;
  create(changeset: Omit<Changeset, "id" | "createdAt">): Promise<Changeset>;
  /** No-op if the pair is already linked — mirrors the unique constraint on (changesetId, issueId). */
  linkIssue(changesetId: string, issueId: string): Promise<void>;
  listForIssue(issueId: string): Promise<Changeset[]>;
  listByScmRepository(scmRepositoryId: string): Promise<Changeset[]>;
  /**
   * Redmine's `Repository#committers`: the distinct (committer, user_id) pairs of this
   * repository's changesets. The mapping screen is driven off the commits that exist, so a
   * committer disappears from it once their changesets are gone.
   */
  listCommitters(scmRepositoryId: string): Promise<CommitterMapping[]>;
  /**
   * The most recent changeset in this repository with exactly this committer string — the
   * first branch of Redmine's `find_committer_user`, which reads the existing mapping off the
   * newest matching commit before trying to match a user by login or email.
   */
  findLatestByCommitter(scmRepositoryId: string, committerIdentity: string): Promise<Changeset | null>;
  /**
   * Redmine's `committer_ids=`: re-points every changeset of this repository with this exact
   * committer string at `userId` (or at nobody, for null) in one bulk update. Deliberately
   * retroactive for changeset authorship only — journals and time entries already written
   * under the previous user are left alone, exactly as in Redmine.
   */
  remapCommitter(scmRepositoryId: string, committerIdentity: string, userId: string | null): Promise<void>;
}
