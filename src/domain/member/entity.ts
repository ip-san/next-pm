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
