import type { GroupRepository } from "@/domain/group/repository";
import type { Member } from "@/domain/member/entity";
import type { MemberRepository } from "@/domain/member/repository";

export interface GroupMembershipRepositories {
  groupRepository: GroupRepository;
  memberRepository: MemberRepository;
}

/**
 * Adds a group as a project member and immediately materializes an inherited member
 * row for every user currently in the group, mirroring Redmine's
 * MemberRole#add_role_to_group_users callback.
 */
export async function addGroupToProject(
  repositories: GroupMembershipRepositories,
  input: { groupId: string; projectId: string; roleIds: string[] },
): Promise<Member> {
  const groupMember = await repositories.memberRepository.create({
    userId: null,
    groupId: input.groupId,
    inheritedFromMemberId: null,
    projectId: input.projectId,
    roleIds: input.roleIds,
  });

  const userIds = await repositories.groupRepository.listUserIds(input.groupId);
  for (const userId of userIds) {
    await repositories.memberRepository.create({
      userId,
      groupId: null,
      inheritedFromMemberId: groupMember.id,
      projectId: input.projectId,
      roleIds: input.roleIds,
    });
  }

  return groupMember;
}

/**
 * Adds a user to a group and materializes an inherited member row in every project
 * where the group already holds membership, mirroring Redmine's Group#user_added.
 */
export async function addUserToGroup(repositories: GroupMembershipRepositories, groupId: string, userId: string): Promise<void> {
  await repositories.groupRepository.addUser(groupId, userId);
  const groupMemberships = await repositories.memberRepository.listByGroup(groupId);
  for (const groupMember of groupMemberships) {
    const alreadyInherited = await repositories.memberRepository.findInherited(groupMember.id, userId);
    if (alreadyInherited) continue;
    await repositories.memberRepository.create({
      userId,
      groupId: null,
      inheritedFromMemberId: groupMember.id,
      projectId: groupMember.projectId,
      roleIds: groupMember.roleIds,
    });
  }
}

/**
 * Removes a user from a group and removes every inherited member row that grant
 * traced back to this group, mirroring Redmine's Group#user_removed.
 */
export async function removeUserFromGroup(repositories: GroupMembershipRepositories, groupId: string, userId: string): Promise<void> {
  await repositories.groupRepository.removeUser(groupId, userId);
  const groupMemberships = await repositories.memberRepository.listByGroup(groupId);
  for (const groupMember of groupMemberships) {
    await repositories.memberRepository.deleteInherited(groupMember.id, userId);
  }
}
