import type { Issue } from "@/domain/issue/entity";
import { resolveProjectChange } from "@/domain/issue/project-change";
import type { IssueRepository, IssueUpdate } from "@/domain/issue/repository";
import type { IssueCategoryRepository } from "@/domain/issue-category/repository";
import type { IssueRelationRepository } from "@/domain/issue-relation/repository";
import { diffIssueChanges } from "@/domain/journal/diff-issue";
import type { JournalRepository } from "@/domain/journal/repository";
import type { ProjectRepository } from "@/domain/project/repository";
import { resolveGeneralSettings } from "@/domain/settings/general-settings";
import type { SettingsRepository } from "@/domain/settings/repository";
import type { TimeEntryRepository } from "@/domain/time-entry/repository";
import type { VersionRepository } from "@/domain/version/repository";

export class ProjectHasNoTrackerError extends Error {
  constructor() {
    super("The target project has no tracker enabled, so no issue can live in it.");
    this.name = "ProjectHasNoTrackerError";
  }
}

export interface MoveIssueRepositories {
  issueRepository: IssueRepository;
  projectRepository: ProjectRepository;
  issueCategoryRepository: IssueCategoryRepository;
  versionRepository: VersionRepository;
  issueRelationRepository: IssueRelationRepository;
  timeEntryRepository: TimeEntryRepository;
  journalRepository: JournalRepository;
  settingsRepository: SettingsRepository;
}

export interface MoveIssueInput {
  issueId: string;
  targetProjectId: string;
  /** Explicit tracker for the moved issue; falls back to Redmine's own rule when omitted. */
  targetTrackerId?: string;
  actingUserId: string;
}

/**
 * Port of Redmine's `Issue#project=` plus its `after_project_change` callback: re-home an
 * issue (and the subtree that lives in the same project) in another project, rewriting the
 * attributes that are scoped to a project.
 *
 * Deliberately separate from `updateIssue`: Redmine's project change is a model-level
 * rewrite, not a `safe_attributes` edit — it reassigns the tracker, category and version on
 * the issue's behalf rather than validating what a user submitted, and it cascades to
 * children, time entries and relations. Running it through the workflow/field-permission
 * machinery would reject moves that Redmine allows.
 */
export async function moveIssue(repositories: MoveIssueRepositories, input: MoveIssueInput): Promise<Issue> {
  const issue = await repositories.issueRepository.findById(input.issueId);
  if (!issue) {
    throw new Error(`Issue ${input.issueId} not found`);
  }
  if (issue.projectId === input.targetProjectId && input.targetTrackerId === undefined) {
    return issue;
  }

  const targetProject = await repositories.projectRepository.findById(input.targetProjectId);
  if (!targetProject) {
    throw new Error(`Project ${input.targetProjectId} not found`);
  }
  // Mirrors `allowed_target_projects(...).having_trackers` — a project with no tracker
  // cannot hold an issue at all.
  if (targetProject.trackerIds.length === 0) {
    throw new ProjectHasNoTrackerError();
  }

  const [targetCategories, targetVersions, sourceCategories] = await Promise.all([
    repositories.issueCategoryRepository.listByProject(input.targetProjectId),
    repositories.versionRepository.listSharedWith(input.targetProjectId),
    repositories.issueCategoryRepository.listByProject(issue.projectId),
  ]);
  const currentCategoryName = sourceCategories.find((category) => category.id === issue.categoryId)?.name ?? null;

  // Every descendant that shares the issue's current project travels with it, as Redmine's
  // after_project_change does; one that already lives elsewhere is left where it is.
  const movedIds = await collectMovableSubtree(repositories, issue);

  const resolved = resolveProjectChange({
    issue,
    targetTrackerIds: targetProject.trackerIds,
    targetCategoryIdByName: new Map(targetCategories.map((category) => [category.name, category.id])),
    currentCategoryName,
    targetSharedVersionIds: new Set(targetVersions.map((version) => version.id)),
    parentMovesToo: false, // the issue being moved is the root of the moved subtree
    keepTracker: false,
  });
  const trackerId =
    input.targetTrackerId !== undefined && targetProject.trackerIds.includes(input.targetTrackerId)
      ? input.targetTrackerId
      : resolved.trackerId;

  const moved = await applyMove(repositories, issue, { ...resolved, trackerId, projectId: input.targetProjectId }, input.actingUserId);

  for (const childId of movedIds.filter((id) => id !== issue.id)) {
    const child = await repositories.issueRepository.findById(childId);
    if (!child) continue;
    const childCategoryName = sourceCategories.find((category) => category.id === child.categoryId)?.name ?? null;
    const childResolved = resolveProjectChange({
      issue: child,
      targetTrackerIds: targetProject.trackerIds,
      targetCategoryIdByName: new Map(targetCategories.map((category) => [category.name, category.id])),
      currentCategoryName: childCategoryName,
      targetSharedVersionIds: new Set(targetVersions.map((version) => version.id)),
      // Every ancestor up to the moved root is in `movedIds`, so a child's parent link survives.
      parentMovesToo: child.parentId !== null && movedIds.includes(child.parentId),
      keepTracker: true,
    });
    await applyMove(repositories, child, { ...childResolved, projectId: input.targetProjectId }, input.actingUserId);
  }

  // Mirrors after_project_change: time entries follow the issues they belong to.
  await repositories.timeEntryRepository.reassignProjectForIssues(movedIds, input.targetProjectId);

  // ...and relations that would now span projects are dropped unless the setting allows them.
  const { crossProjectIssueRelations } = resolveGeneralSettings(await repositories.settingsRepository.getAll());
  if (!crossProjectIssueRelations) {
    await dropCrossProjectRelations(repositories, movedIds, input.targetProjectId);
  }

  return moved;
}

/** The issue plus every descendant currently sharing its project, parents before children. */
async function collectMovableSubtree(repositories: MoveIssueRepositories, issue: Issue): Promise<string[]> {
  const projectIssues = await repositories.issueRepository.listByProject(issue.projectId);
  const childrenByParent = new Map<string, string[]>();
  for (const candidate of projectIssues) {
    if (!candidate.parentId) continue;
    childrenByParent.set(candidate.parentId, [...(childrenByParent.get(candidate.parentId) ?? []), candidate.id]);
  }

  const ordered: string[] = [];
  const queue = [issue.id];
  const seen = new Set<string>([issue.id]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    ordered.push(current);
    for (const childId of childrenByParent.get(current) ?? []) {
      if (seen.has(childId)) continue; // guards a cycle left behind by older data
      seen.add(childId);
      queue.push(childId);
    }
  }
  return ordered;
}

async function applyMove(
  repositories: MoveIssueRepositories,
  issue: Issue,
  changes: IssueUpdate,
  actingUserId: string,
): Promise<Issue> {
  const after = await repositories.issueRepository.update(issue.id, issue.lockVersion, changes);
  const details = diffIssueChanges(issue, changes);
  if (details.length > 0) {
    await repositories.journalRepository.create({
      journalizedType: "Issue",
      journalizedId: issue.id,
      userId: actingUserId,
      notes: "",
      details,
    });
  }
  return after;
}

async function dropCrossProjectRelations(
  repositories: MoveIssueRepositories,
  movedIds: string[],
  targetProjectId: string,
): Promise<void> {
  const moved = new Set(movedIds);
  for (const issueId of movedIds) {
    const relations = await repositories.issueRelationRepository.listForIssue(issueId);
    for (const relation of relations) {
      const otherId = relation.issueFromId === issueId ? relation.issueToId : relation.issueFromId;
      if (moved.has(otherId)) continue; // both ends travelled together — still same-project
      const other = await repositories.issueRepository.findById(otherId);
      if (other && other.projectId !== targetProjectId) {
        await repositories.issueRelationRepository.delete(relation.id);
      }
    }
  }
}
