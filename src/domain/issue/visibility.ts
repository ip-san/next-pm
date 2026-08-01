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
