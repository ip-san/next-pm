import type { UsersVisibility } from "@/domain/role/entity";

/**
 * Redmine's `Principal.visible` / `User.visible` (app/models/principal.rb): which other users a
 * viewer may see as a principal. An administrator sees everyone. Anyone else sees the active
 * users if one of the roles that governs them has `users_visibility = all`, and otherwise sees
 * only themselves and the members of the projects they can view.
 */
export function viewAllActiveUsers(roles: { usersVisibility: UsersVisibility }[]): boolean {
  return roles.some((role) => role.usersVisibility === "all");
}

export interface UserVisibilityScope {
  viewerId: string | null;
  isAdmin: boolean;
  viewAllActive: boolean;
  /** User ids (and group principal ids) of the members of every project the viewer can view. */
  membersOfVisibleProjects: ReadonlySet<string>;
}

export function canSeeUser(scope: UserVisibilityScope, targetId: string): boolean {
  if (scope.isAdmin || scope.viewAllActive) return true;
  if (scope.viewerId !== null && scope.viewerId === targetId) return true;
  return scope.membersOfVisibleProjects.has(targetId);
}
