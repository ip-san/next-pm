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

/**
 * Faithful port of Redmine's `Query#editable_by?` (query.rb#L550):
 *
 *   return true if user.admin? || (is_private? && self.user_id == user.id)
 *   is_public? && !is_global? && user.allowed_to?(:manage_public_queries, project)
 *
 * Three consequences worth spelling out, because they're easy to "fix" by accident:
 * - owning a *private* query is enough on its own; `save_queries` is not re-checked here
 *   (Redmine's QueriesController#find_query runs no permission check beyond this method);
 * - `is_public?` in Redmine means "not private", so a roles-scoped query follows the same
 *   branch as a fully public one;
 * - a global (project-less) public query is editable by admins only, which is what keeps
 *   `manage_public_queries` — a per-project permission — from leaking across projects.
 */
export function isQueryEditable(
  query: Pick<SavedQuery, "visibility" | "userId" | "projectId">,
  actor: { userId: string | null; isAdmin: boolean; canManagePublicQueries: boolean },
): boolean {
  if (!actor.userId) return false;
  if (actor.isAdmin) return true;
  if (query.visibility === "private") return query.userId === actor.userId;
  return query.projectId !== null && actor.canManagePublicQueries;
}
