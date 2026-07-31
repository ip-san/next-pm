import type { WorkflowTransition } from "./entity";

export interface TransitionQuery {
  trackerId: string;
  roleIds: string[];
  currentStatusId: string;
  /** Is the acting user the issue's author? Unlocks transitions flagged `author`. */
  isAuthor: boolean;
  /** Is the acting user the issue's assignee? Unlocks transitions flagged `assignee`. */
  isAssignee: boolean;
}

/**
 * Faithful port of Redmine's `IssueStatus.new_statuses_allowed` gating (see
 * redmine/app/models/issue_status.rb#L64). A transition row is usable when it's
 * unflagged (author=false AND assignee=false — always available to the role), OR the
 * actor is the issue's author and the row is author-flagged, OR the actor is the
 * assignee and the row is assignee-flagged. The current status is always included
 * once at least one transition exists, matching Issue#new_statuses_allowed_to.
 */
export function allowedNewStatusIds(
  transitions: WorkflowTransition[],
  query: TransitionQuery,
): string[] {
  const matching = transitions.filter(
    (t) =>
      t.trackerId === query.trackerId &&
      t.oldStatusId === query.currentStatusId &&
      query.roleIds.includes(t.roleId) &&
      ((!t.author && !t.assignee) ||
        (query.isAuthor && t.author) ||
        (query.isAssignee && t.assignee)),
  );

  const ids = new Set(matching.map((t) => t.newStatusId));
  if (ids.size > 0) {
    ids.add(query.currentStatusId);
  }
  return Array.from(ids);
}

export function canTransitionTo(
  transitions: WorkflowTransition[],
  query: TransitionQuery,
  targetStatusId: string,
): boolean {
  return allowedNewStatusIds(transitions, query).includes(targetStatusId);
}
