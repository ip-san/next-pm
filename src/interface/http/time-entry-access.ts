import { can, type AuthorizationActor, type ProjectAuthorizationContext } from "@/domain/authorization/authorization-service";
import type { Issue } from "@/domain/issue/entity";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import type { TimeEntriesVisibility } from "@/domain/role/entity";
import type { SpentHoursScope } from "@/domain/query/issue-search";
import type { TimeEntry } from "@/domain/time-entry/entity";
import { isTimeEntryVisible, seesOnlyOwnTimeEntries } from "@/domain/time-entry/visibility";
import { issuesVisibilityRoles } from "./resolve-actor";

/**
 * Roles to feed into `isTimeEntryVisible`, the time-entry twin of
 * resolve-actor.ts's `issuesVisibilityRoles` — an admin carries no real roles, so it gets a
 * synthetic "all" rather than every call site special-casing `actor.kind === "admin"`.
 */
export function timeEntriesVisibilityRoles(actor: AuthorizationActor): { timeEntriesVisibility: TimeEntriesVisibility }[] {
  switch (actor.kind) {
    case "admin":
      return [{ timeEntriesVisibility: "all" }];
    case "member":
      return actor.roles;
    case "non_member":
    case "anonymous":
      return [actor.role];
  }
}

/**
 * The `spent_hours` scope for one viewer, so the issue list's column, sort and totals sum
 * over the same entries its time-entry screens would have shown them.
 */
export function spentHoursScopeFor(actor: AuthorizationActor, userId: string | null): SpentHoursScope {
  return seesOnlyOwnTimeEntries(timeEntriesVisibilityRoles(actor)) ? { kind: "own", userId } : { kind: "all" };
}

type VisibleIssue = Pick<Issue, "isPrivate" | "authorId" | "assignedToId" | "assignedToType">;

export interface TimeEntryAccessContext {
  userId: string | null;
  actor: AuthorizationActor;
  userGroupIds: string[];
  projectContext: ProjectAuthorizationContext;
  /** Issues referenced by the entries being checked; a missing id is treated as "not visible". */
  issueById: Map<string, VisibleIssue>;
}

/**
 * The single predicate every read of a time entry goes through — list, report, CSV export,
 * REST (collection and single), and the edit/delete paths, which must not expose an entry
 * the same actor couldn't have found in the list.
 *
 * Three narrowings, in Redmine's own order:
 *   1. `view_time_entries` on the project. `can` already covers the archived project, the
 *      closed project and the disabled `time_tracking` module.
 *   2. TimeEntry.visible_condition's role block: a role with `time_entries_visibility ==
 *      "own"` only ever sees rows whose *user* is the viewer.
 *   3. the entry's issue, if it has one, must itself be visible. Redmine keeps this out of
 *      visible_condition and applies it when rendering the issue column (`left_join_issue`);
 *      next-pm drops the whole row instead, because an entry against a private issue
 *      reveals that the issue exists even without its subject.
 */
export function canAccessTimeEntry(
  entry: Pick<TimeEntry, "userId" | "issueId">,
  context: TimeEntryAccessContext,
): boolean {
  if (!can({ permission: "view_time_entries", project: context.projectContext, actor: context.actor })) {
    return false;
  }
  if (!isTimeEntryVisible(entry, context.userId, timeEntriesVisibilityRoles(context.actor))) {
    return false;
  }
  if (entry.issueId === null) {
    return true;
  }
  const issue = context.issueById.get(entry.issueId);
  return issue !== undefined && isPrivateIssueVisible(issue, context.userId, context.userGroupIds, issuesVisibilityRoles(context.actor));
}

/** Bulk form of `canAccessTimeEntry` for the list-shaped callers. */
export function filterAccessibleTimeEntries<T extends Pick<TimeEntry, "userId" | "issueId">>(
  entries: T[],
  context: TimeEntryAccessContext,
): T[] {
  return entries.filter((entry) => canAccessTimeEntry(entry, context));
}

/**
 * Whether `issue` may be the issue of a time entry in `projectId`. Mirrors the issue branch
 * of TimeEntry#safe_attributes= plus validate_time_entry's
 * `errors.add :issue_id, :invalid if (issue_id && !issue) || (issue && project != issue.project)`:
 * the issue has to exist, belong to the project the entry is booked against, be visible to
 * the actor, and the actor needs `log_time` there — holding only `edit_time_entries` lets
 * you correct an entry, not attach it to an issue you couldn't log against yourself.
 */
export function canAttachIssueToTimeEntry(
  issue: (VisibleIssue & Pick<Issue, "projectId">) | null,
  projectId: string,
  context: Pick<TimeEntryAccessContext, "userId" | "actor" | "userGroupIds" | "projectContext">,
): boolean {
  if (!issue || issue.projectId !== projectId) {
    return false;
  }
  if (!can({ permission: "log_time", project: context.projectContext, actor: context.actor })) {
    return false;
  }
  return isPrivateIssueVisible(issue, context.userId, context.userGroupIds, issuesVisibilityRoles(context.actor));
}

/**
 * Who a time entry may be attributed to, mirroring TimeEntry#safe_attributes= +
 * validate_time_entry:
 *
 *   if user_id_changed? && user_id != author_id && !allowed_to?(:log_time_for_other_users)
 *   ... errors.add :user_id, :invalid unless assignable_users.map(&:id).include?(user_id)
 *
 * Two things follow that are easy to get wrong. The comparison is against the entry's
 * **author**, not whoever is editing — so on creation (author == the actor) booking your
 * own time is always free, while re-pointing somebody else's entry at yourself is not.
 * And holding `log_time_for_other_users` is not enough on its own: the target still has to
 * be in `assignable_users`, so the permission can't be used to invent an attribution to an
 * account the project would never have accepted a log from.
 *
 * Callers pass `changed: false` when the attribution is untouched; Redmine runs no check at
 * all then, and re-validating would block an ordinary edit of an entry whose user has since
 * lost their membership.
 */
export function canAttributeTimeEntryTo(input: {
  changed: boolean;
  requestedUserId: string;
  authorId: string;
  assignableUserIds: string[];
  canLogTimeForOtherUsers: boolean;
}): boolean {
  if (!input.changed || input.requestedUserId === input.authorId) {
    return true;
  }
  return input.canLogTimeForOtherUsers && input.assignableUserIds.includes(input.requestedUserId);
}
