import { isActiveUser, type User } from "@/domain/user/entity";
import { hasPermission } from "@/domain/role/entity";
import type { MemberRepository } from "@/domain/member/repository";
import type { RoleRepository } from "@/domain/role/repository";
import type { UserRepository } from "@/domain/user/repository";

/**
 * Mirrors TimeEntry#assignable_users: the active members of the project whose roles grant
 * `log_time`, plus the current user (who can always log their own time, member or not —
 * an admin logging time on a project they don't belong to is the usual case).
 *
 * This is the whitelist `log_time_for_other_users` is checked against: holding the
 * permission doesn't let you attribute time to an arbitrary account, only to someone the
 * project would have accepted a log from anyway.
 */
export async function listAssignableTimeEntryUsers(
  repositories: { memberRepository: MemberRepository; roleRepository: RoleRepository; userRepository: UserRepository },
  projectId: string,
  currentUser: User,
): Promise<User[]> {
  const members = await repositories.memberRepository.listByProject(projectId);
  const roleIds = [...new Set(members.flatMap((member) => member.roleIds))];
  const roles = await repositories.roleRepository.findByIds(roleIds);
  const roleById = new Map(roles.map((role) => [role.id, role]));

  const userIds = new Set(
    members
      .filter((member) =>
        member.roleIds.some((roleId) => {
          const role = roleById.get(roleId);
          return role ? hasPermission(role, "log_time") : false;
        }),
      )
      .flatMap((member) => (member.userId ? [member.userId] : [])),
  );

  const users = (await repositories.userRepository.findByIds([...userIds])).filter(isActiveUser);
  if (!users.some((user) => user.id === currentUser.id)) {
    users.push(currentUser);
  }
  return users.sort((a, b) => a.login.localeCompare(b.login));
}
