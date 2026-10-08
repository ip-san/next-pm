import type { IssueRepository } from "@/domain/issue/repository";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import type { IssuesVisibility } from "@/domain/role/entity";
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
  viewerId: string | null;
  viewerGroupIds: string[];
  issueVisibilityRoles: { issuesVisibility: IssuesVisibility }[];
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
  if (!issue || !isPrivateIssueVisible(issue, input.viewerId, input.viewerGroupIds, input.issueVisibilityRoles)) return;

  await repositories.changesetRepository.unlinkIssue(changeset.id, issue.id);
}
