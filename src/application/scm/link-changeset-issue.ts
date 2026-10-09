import { findIssuesByReference } from "@/application/issues/find-issues-by-reference";
import type { Issue } from "@/domain/issue/entity";
import type { IssueRepository } from "@/domain/issue/repository";
import type { Project } from "@/domain/project/entity";
import type { ProjectRepository } from "@/domain/project/repository";
import type { ChangesetRepository } from "@/domain/scm/changeset-repository";
import type { ScmRepository } from "@/domain/scm/entity";
import { canReferenceIssueProject } from "@/domain/scm/issue-reference";
import type { ScmBrowser } from "@/domain/scm/scm-browser";
import type { UserRepository } from "@/domain/user/repository";
import { findOrCreateChangeset } from "./find-or-create-changeset";

export class InvalidChangesetIssueLinkError extends Error {}

export interface LinkChangesetIssueRepositories {
  scmBrowser: ScmBrowser;
  changesetRepository: ChangesetRepository;
  issueRepository: IssueRepository;
  projectRepository: ProjectRepository;
  userRepository: UserRepository;
}

export interface LinkChangesetIssueInput {
  scmRepository: ScmRepository;
  /** The repository's own project, already loaded by the caller. */
  repositoryProject: Project;
  revision: string;
  /** What the user typed, with or without the leading "#" — next-pm's 8-hex id shorthand. */
  issueRef: string;
  /** Redmine's `Issue#visible?` for the viewer, across projects — see `issueVisibilityCheck`. */
  canViewIssue: (issue: Issue) => boolean;
  /** Setting.commit_cross_project_ref. */
  crossProjectRef: boolean;
}

/**
 * Mirrors Redmine's `RepositoriesController#add_related_issue`, which resolves the issue
 * through `Changeset#find_referenced_issue_by_id` and then nils it out unless it is both
 * visible and not already linked. Redmine reports every one of those failures identically
 * ("Issue is invalid"), and so does this — distinguishing them would let someone probe for
 * issues they can't see.
 *
 * The one place it has to do more than Redmine: Redmine's revision page is backed by a stored
 * changeset, next-pm's is read live from the SCM, so the row is materialized on demand here.
 */
export async function linkChangesetIssue(
  repositories: LinkChangesetIssueRepositories,
  input: LinkChangesetIssueInput,
): Promise<{ changesetId: string; issue: Issue }> {
  const issueRef = input.issueRef.trim().replace(/^#/, "");
  if (issueRef.length === 0) {
    throw new InvalidChangesetIssueLinkError("チケットが不正です。");
  }

  const candidates = await findIssuesByReference(repositories.issueRepository, issueRef);
  // An ambiguous prefix is rejected rather than resolved arbitrarily: the shorthand is a
  // display convenience, and picking one of several matches would link the wrong issue.
  if (candidates.length !== 1) {
    throw new InvalidChangesetIssueLinkError("チケットが不正です。");
  }
  const issue = candidates[0];

  const issueProject = await repositories.projectRepository.findById(issue.projectId);
  if (!issueProject || !canReferenceIssueProject(input.repositoryProject, issueProject, input.crossProjectRef)) {
    throw new InvalidChangesetIssueLinkError("チケットが不正です。");
  }
  if (!input.canViewIssue(issue)) {
    throw new InvalidChangesetIssueLinkError("チケットが不正です。");
  }

  const changeset = await findOrCreateChangeset(repositories, input.scmRepository, input.revision);
  if (!changeset) {
    throw new InvalidChangesetIssueLinkError("リビジョンが見つかりません。");
  }

  const linked = await repositories.changesetRepository.listIssueIds(changeset.id);
  if (linked.includes(issue.id)) {
    throw new InvalidChangesetIssueLinkError("チケットが不正です。");
  }

  await repositories.changesetRepository.linkIssue(changeset.id, issue.id);
  return { changesetId: changeset.id, issue };
}
