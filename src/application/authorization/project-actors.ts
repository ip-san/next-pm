import type { AuthorizationActor } from "@/domain/authorization/authorization-service";
import type { MemberRepository } from "@/domain/member/repository";
import type { RoleRepository } from "@/domain/role/repository";
import type { UserRepository } from "@/domain/user/repository";

export interface ProjectActorRepositories {
  memberRepository: MemberRepository;
  roleRepository: RoleRepository;
  userRepository: UserRepository;
}

/**
 * Resolves what each of `userIds` is *on one project* — admin, member with their roles, or
 * non-member — so a caller can ask `can(...)` about other people rather than about the
 * acting user. Needed wherever a decision depends on a third party's permissions: who may
 * be told about a private note, which watchers may follow a copy into another project.
 *
 * This is the counterpart of `resolveActor` in the HTTP layer, which answers the same
 * question for the one user making the request.
 */
export async function resolveProjectActors(
  repositories: ProjectActorRepositories,
  projectId: string,
  userIds: string[],
): Promise<Map<string, AuthorizationActor>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();

  const [users, members, nonMemberRole] = await Promise.all([
    repositories.userRepository.findByIds(unique),
    repositories.memberRepository.listByProject(projectId),
    repositories.roleRepository.findBuiltinNonMember(),
  ]);
  const roleIdsByUserId = new Map(members.flatMap((member) => (member.userId ? [[member.userId, member.roleIds] as const] : [])));
  const roles = await repositories.roleRepository.findByIds([...new Set(members.flatMap((member) => member.roleIds))]);
  const roleById = new Map(roles.map((role) => [role.id, role]));

  const actors = new Map<string, AuthorizationActor>();
  for (const user of users) {
    const memberRoleIds = roleIdsByUserId.get(user.id);
    actors.set(
      user.id,
      user.isAdmin
        ? { kind: "admin" }
        : memberRoleIds
          ? { kind: "member", roles: memberRoleIds.flatMap((roleId) => (roleById.get(roleId) ? [roleById.get(roleId)!] : [])) }
          : { kind: "non_member", role: nonMemberRole },
    );
  }
  return actors;
}
