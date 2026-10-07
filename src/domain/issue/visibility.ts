import type { Member } from "@/domain/member/entity";
import type { IssuesVisibility } from "@/domain/role/entity";
import type { Issue } from "./entity";

/**
 * Faithful port of Redmine's private-issue gating from Issue#visible? (issue.rb#L181) and
 * Issue.visible_condition (issue.rb#L137). Only relevant when `issue.isPrivate` is true —
 * a non-private issue is visible to anyone who already passed the `view_issues`
 * permission check. Admins bypass this entirely (mirrors User#allowed_to?'s admin
 * short-circuit, which never invokes the per-role visibility block) — callers should skip
 * this check for an admin actor rather than pass it here.
 *
 * Notably, Redmine's "default" and "own" issues_visibility settings resolve identically
 * once is_private is true — both require author/assignee — so they collapse below;
 * only "all" differs.
 */
export function isPrivateIssueVisible(
  issue: Pick<Issue, "isPrivate" | "authorId" | "assignedToId" | "assignedToType">,
  userId: string | null,
  userGroupIds: string[],
  roles: { issuesVisibility: IssuesVisibility }[],
): boolean {
  if (!issue.isPrivate) return true;
  if (!userId) return false; // anonymous visitors never see private issues

  const isAuthor = issue.authorId === userId;
  const isDirectAssignee = issue.assignedToType !== "group" && issue.assignedToId === userId;
  const isGroupAssignee =
    issue.assignedToType === "group" && issue.assignedToId !== null && userGroupIds.includes(issue.assignedToId);
  if (isAuthor || isDirectAssignee || isGroupAssignee) return true;

  return roles.some((role) => role.issuesVisibility === "all");
}

/**
 * Faithful port of Issue#notified_users' `notified.reject! {|user| !visible?(user)}` step,
 * restricted to the "notify every project member" candidate group — author/assignee are
 * always visible to themselves by construction, so callers should union this result with
 * those ids separately rather than pass them through here.
 *
 * Only the private-issue-visibility half of `visible?` is checked (a project member has
 * already passed `view_issues` to appear in the member list at all). A global admin who is
 * also a restricted-role project member is not special-cased to bypass this — unlike the
 * leak this guards against, that only costs them one missed notification email, not a
 * disclosure, so it's left as a simplification rather than plumbed through here.
 */
export function filterMembersVisibleToPrivateIssue<M extends Pick<Member, "userId" | "roleIds">>(
  issue: Pick<Issue, "isPrivate">,
  members: M[],
  rolesById: Map<string, { issuesVisibility: IssuesVisibility }>,
): M[] {
  if (!issue.isPrivate) return members;
  return members.filter((member) => member.roleIds.some((roleId) => rolesById.get(roleId)?.issuesVisibility === "all"));
}

/**
 * Faithful port of the `notified.reject! {|user| !visible?(user)}` step that Redmine applies
 * to *watchers* as well as members (`acts_as_watchable`'s `notified_watchers`, which runs the
 * same rejection as `Issue#notified_users`). Watchers are a separate recipient group from
 * project members — a watcher can keep watching an issue that is later turned private, and
 * mailing them its subject and notes would leak exactly what the private flag is for.
 *
 * `rolesByUserId` carries each candidate's roles on the issue's project; a watcher with no
 * entry (no longer a member, so no `view_issues` either) never passes. Group-assignee
 * membership isn't resolved here — a watcher who can only see the issue because a group they
 * belong to is the assignee is dropped, which costs one notification rather than leaking,
 * the same trade-off `filterMembersVisibleToPrivateIssue` documents above.
 */
export function filterUserIdsVisibleToPrivateIssue(
  issue: Pick<Issue, "isPrivate" | "authorId" | "assignedToId" | "assignedToType">,
  userIds: string[],
  rolesByUserId: Map<string, { issuesVisibility: IssuesVisibility }[]>,
): string[] {
  if (!issue.isPrivate) return userIds;
  return userIds.filter((userId) => isPrivateIssueVisible(issue, userId, [], rolesByUserId.get(userId) ?? []));
}
