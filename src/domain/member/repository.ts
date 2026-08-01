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
  delete(memberId: string): Promise<void>;
  /** Deletes the inherited row materialized for `userId` from the group membership `groupMemberId`. */
  deleteInherited(groupMemberId: string, userId: string): Promise<void>;
  /** The inherited row (if any) already materialized for `userId` from the group membership `groupMemberId`. */
  findInherited(groupMemberId: string, userId: string): Promise<Member | null>;
}
