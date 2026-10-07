import type { Issue } from "./entity";

export interface ProjectChangeInput {
  issue: Pick<Issue, "trackerId" | "categoryId" | "fixedVersionId" | "parentId">;
  /** Trackers enabled on the target project. */
  targetTrackerIds: string[];
  /** The target project's category ids keyed by name — Redmine re-matches by name, not id. */
  targetCategoryIdByName: ReadonlyMap<string, string>;
  /** The name of the issue's current category, if it has one. */
  currentCategoryName: string | null;
  /** Versions the target project can assign: its own plus those shared with it. */
  targetSharedVersionIds: ReadonlySet<string>;
  /** True when the issue's parent is moving in the same operation (a subtask moved with its parent). */
  parentMovesToo: boolean;
  /**
   * Redmine's `keep_tracker` argument: set when a subtask is dragged along with its parent,
   * so a tracker the target project doesn't enable isn't silently rewritten per child.
   */
  keepTracker: boolean;
}

export interface ProjectChangeResult {
  trackerId: string;
  categoryId: string | null;
  fixedVersionId: string | null;
  parentId: string | null;
}

/**
 * Faithful port of the `project_was != project` branch of Redmine's `Issue#project=`
 * (`app/models/issue.rb`), minus the two rules that have no next-pm equivalent: clearing the
 * assignee (Redmine only does that for new records, i.e. copies — an existing issue keeps its
 * assignee) and the default-version seeding (next-pm projects have no `default_version`).
 *
 * The parent rule differs in reach, not in intent: Redmine consults its
 * `cross_project_subtasks` setting, while next-pm requires a parent to live in the same
 * project (enforced in `updateIssue`), which is Redmine's `cross_project_subtasks = ''`
 * case — so the parent is kept only when it is moving along in the same operation.
 */
export function resolveProjectChange(input: ProjectChangeInput): ProjectChangeResult {
  const { issue } = input;

  const trackerId =
    input.keepTracker || input.targetTrackerIds.includes(issue.trackerId)
      ? issue.trackerId
      : (input.targetTrackerIds[0] ?? issue.trackerId);

  // "Reassign to the category with same name if any" — an unmatched name drops the category.
  const categoryId = input.currentCategoryName ? (input.targetCategoryIdByName.get(input.currentCategoryName) ?? null) : null;

  const fixedVersionId =
    issue.fixedVersionId && input.targetSharedVersionIds.has(issue.fixedVersionId) ? issue.fixedVersionId : null;

  const parentId = issue.parentId && input.parentMovesToo ? issue.parentId : null;

  return { trackerId, categoryId, fixedVersionId, parentId };
}
