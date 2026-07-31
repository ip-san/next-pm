import type { SavedQuery } from "./entity";

/**
 * Mirrors Redmine's Query#visible? (query.rb): a private query is visible only to its
 * owner; a "roles"-scoped query is visible to anyone holding one of its associated roles;
 * a public query is visible to any project member. Admins bypass this entirely — callers
 * should skip this check for an admin actor, same convention as isPrivateIssueVisible.
 */
export function isQueryVisible(
  query: Pick<SavedQuery, "visibility" | "userId" | "roleIds">,
  userId: string,
  actorRoleIds: string[],
): boolean {
  switch (query.visibility) {
    case "private":
      return query.userId === userId;
    case "roles":
      return query.userId === userId || query.roleIds.some((roleId) => actorRoleIds.includes(roleId));
    case "public":
      return true;
  }
}
