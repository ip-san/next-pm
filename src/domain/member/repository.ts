import type { Member } from "./entity";

export interface MemberRepository {
  findById(memberId: string): Promise<Member | null>;
  /**
   * A user can hold more than one member row per project once groups exist (one direct
   * row plus one inherited row per group they belong to) — this aggregates roleIds
   * across all of them, mirroring Redmine's User#roles_for_project union semantics.
   */
  findByUserAndProject(userId: string, projectId: string): Promise<Member | null>;
  /** The user's own direct (non-group-inherited) membership row only — used for "already a member" checks. */
  findDirectByUserAndProject(userId: string, projectId: string): Promise<Member | null>;
  listByProject(projectId: string): Promise<Member[]>;
  /** Group-principal rows (groupId = groupId) across every project the group is a member of. */
  listByGroup(groupId: string): Promise<Member[]>;
  create(member: Omit<Member, "id">): Promise<Member>;
  /** Inserts every row in one transaction — all-or-nothing, unlike calling create() in a loop. */
  createMany(members: Omit<Member, "id">[]): Promise<Member[]>;
  delete(memberId: string): Promise<void>;
  /** Deletes the inherited row materialized for `userId` from the group membership `groupMemberId`. */
  deleteInherited(groupMemberId: string, userId: string): Promise<void>;
  /** Deletes every listed (groupMemberId, userId) inherited row in one transaction — all-or-nothing. */
  deleteManyInherited(pairs: { groupMemberId: string; userId: string }[]): Promise<void>;
  /** The inherited row (if any) already materialized for `userId` from the group membership `groupMemberId`. */
  findInherited(groupMemberId: string, userId: string): Promise<Member | null>;
}

/**
 * The extra reads/writes the admin "ユーザー → プロジェクト" tab needs — Redmine's
 * PrincipalMembershipsController, which edits a principal's memberships across projects
 * rather than one project's member list.
 */
export interface MemberAdminRepository {
  /** Every membership row of one user, direct and group-inherited alike. */
  listByUser(userId: string): Promise<Member[]>;
  /** Replaces a membership's role set wholesale (PrincipalMembershipsController#update). */
  replaceRoles(memberId: string, roleIds: string[]): Promise<void>;
}

/**
 * Mirrors Member#deletable? / #any_inherited_role?: a row materialized from a group membership
 * belongs to that group, so it can only go by removing the user from the group (or the group
 * from the project), never from the membership list itself.
 */
export function isMembershipEditable(member: Pick<Member, "inheritedFromMemberId">): boolean {
  return member.inheritedFromMemberId === null;
}
