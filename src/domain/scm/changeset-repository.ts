import type { Changeset } from "./entity";

export interface ChangesetRepository {
  findByRevision(scmRepositoryId: string, revision: string): Promise<Changeset | null>;
  create(changeset: Omit<Changeset, "id" | "createdAt">): Promise<Changeset>;
  /** No-op if the pair is already linked — mirrors the unique constraint on (changesetId, issueId). */
  linkIssue(changesetId: string, issueId: string): Promise<void>;
  listForIssue(issueId: string): Promise<Changeset[]>;
  listByScmRepository(scmRepositoryId: string): Promise<Changeset[]>;
}
