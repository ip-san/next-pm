import type { UserStatus } from "@/domain/user/entity";

/** Parses a `<select>` value of a bare uuid (user) or "group:<uuid>" (group) into a Principal reference. */
export function parseAssigneeValue(value: string): { id: string; type: "user" | "group" } | null {
  if (value === "") return null;
  if (value.startsWith("group:")) {
    const id = value.slice("group:".length);
    return id ? { id, type: "group" } : null;
  }
  return { id: value, type: "user" };
}

/**
 * Faithful port of Redmine's `Issue#assignable_users` layered on `Project#assignable_users`
 * (`app/models/issue.rb`, `app/models/project.rb`):
 *
 *   - project members are assignable only through a role flagged `assignable`
 *   - user principals must be active; a locked or merely registered account is not offerable
 *   - group principals are assignable as they are (Redmine gates this on the
 *     `issue_group_assignment` setting, which next-pm has no equivalent of — group
 *     assignment has always been unconditional here, so adding the gate would be a
 *     behaviour change rather than a parity fix)
 *   - the author is always assignable, provided the account is still active
 *   - whoever is assigned *right now* stays assignable even once none of the above holds,
 *     so an edit that doesn't touch the assignee can still be saved
 *
 * Redmine additionally rejects roles that can't view the issue's tracker; next-pm has no
 * per-tracker role permissions, so that filter has nothing to apply here.
 */
export function assignablePrincipalIds(
  members: { userId: string | null; groupId: string | null; roleIds: string[] }[],
  rolesById: Map<string, { assignable: boolean }>,
  userStatusById: Map<string, UserStatus>,
  extra: { authorId: string | null; currentAssignee: { id: string; type: "user" | "group" } | null },
): { userIds: Set<string>; groupIds: Set<string> } {
  const userIds = new Set<string>();
  const groupIds = new Set<string>();

  for (const member of members) {
    if (!member.roleIds.some((roleId) => rolesById.get(roleId)?.assignable)) continue;
    if (member.groupId) groupIds.add(member.groupId);
    if (member.userId && userStatusById.get(member.userId) === "active") userIds.add(member.userId);
  }

  if (extra.authorId && userStatusById.get(extra.authorId) === "active") {
    userIds.add(extra.authorId);
  }
  if (extra.currentAssignee) {
    (extra.currentAssignee.type === "group" ? groupIds : userIds).add(extra.currentAssignee.id);
  }

  return { userIds, groupIds };
}
