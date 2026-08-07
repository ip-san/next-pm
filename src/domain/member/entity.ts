import { hasPermission } from "@/domain/role/entity";
import type { PermissionKey } from "@/domain/authorization/permission-registry";
import type { Role } from "@/domain/role/entity";

// Exactly one of userId/groupId is set — a member row's principal is either a user
// (direct membership) or a group (grants the role to every current and future group
// user; see application/groups/group-membership.ts for how that's materialized).
// inheritedFromMemberId is set only on rows materialized from a group's membership.
export interface Member {
  id: string;
  userId: string | null;
  groupId: string | null;
  inheritedFromMemberId: string | null;
  projectId: string;
  roleIds: string[];
}

/** User ids with access via this member list — direct rows plus users granted access through a group. */
export function memberUserIds(members: Pick<Member, "userId">[]): string[] {
  return members.flatMap((member) => (member.userId ? [member.userId] : []));
}

/**
 * Notification candidate pools for Wiki/News don't have an issue-style visibility rule to
 * enforce, but they still shouldn't mail a member whose role can't view the module at all
 * (e.g. the wiki module disabled for their role, or a role scoped away from it) — this is
 * the generic form of the ad-hoc rolesById filter issue-actions.ts builds inline.
 */
export function filterMembersWithPermission<M extends Pick<Member, "roleIds">>(
  members: M[],
  rolesById: Map<string, Pick<Role, "permissions">>,
  permission: PermissionKey,
): M[] {
  return members.filter((member) =>
    member.roleIds.some((roleId) => {
      const role = rolesById.get(roleId);
      return role ? hasPermission(role, permission) : false;
    }),
  );
}
