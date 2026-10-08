import type { IssueRepository } from "@/domain/issue/repository";
import type { Issue } from "@/domain/issue/entity";
import type { ChangesetRepository } from "@/domain/scm/changeset-repository";
import type { ScmRepository } from "@/domain/scm/entity";

export interface UnlinkChangesetIssueRepositories {
  changesetRepository: ChangesetRepository;
  issueRepository: IssueRepository;
}

export interface UnlinkChangesetIssueInput {
  scmRepository: ScmRepository;
  revision: string;
  issueId: string;
  /** Redmine's `Issue#visible?` for the viewer, across projects — see `issueVisibilityCheck`. */
  canViewIssue: (issue: Issue) => boolean;
}

/**
 * Mirrors Redmine's `RepositoriesController#remove_related_issue`, which is deliberately
 * permissive: it looks the issue up through the global `Issue.visible` scope, deletes the
 * association if there is one, and reports success either way — including when the issue
 * doesn't exist or was never linked. Unlike the add side it applies no cross-project rule,
 * because removing a link that is already there can't reveal anything.
 *
 * Nothing is created on demand here: with no stored changeset there is no link to remove.
 */
export async function unlinkChangesetIssue(
  repositories: UnlinkChangesetIssueRepositories,
  input: UnlinkChangesetIssueInput,
): Promise<void> {
  const changeset = await repositories.changesetRepository.findByRevision(input.scmRepository.id, input.revision);
  if (!changeset) return;

  const issue = await repositories.issueRepository.findById(input.issueId);
  if (!issue || !input.canViewIssue(issue)) return;

  await repositories.changesetRepository.unlinkIssue(changeset.id, issue.id);
}
