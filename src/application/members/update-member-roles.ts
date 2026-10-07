import { can, projectAuthorizationContext, type AuthorizationActor } from "@/domain/authorization/authorization-service";
import { isMembershipEditable, type MemberAdminRepository, type MemberRepository } from "@/domain/member/repository";
import type { ProjectRepository } from "@/domain/project/repository";
import type { RoleRepository } from "@/domain/role/repository";

export class UpdateMemberRolesNotPermittedError extends Error {
  constructor() {
    super("The acting user may not change this membership's roles.");
    this.name = "UpdateMemberRolesNotPermittedError";
  }
}

/** Redmine's Member#validate_role — a membership with no role would grant nothing. */
export class MemberRolesEmptyError extends Error {
  constructor() {
    super("A membership must keep at least one role.");
    this.name = "MemberRolesEmptyError";
  }
}

export class MemberRolesInvalidError extends Error {
  constructor() {
    super("One of the given roles does not exist or is not assignable.");
    this.name = "MemberRolesInvalidError";
  }
}

export interface UpdateMemberRolesRepositories {
  memberRepository: MemberRepository;
  memberAdminRepository: MemberAdminRepository;
  projectRepository: ProjectRepository;
  roleRepository: RoleRepository;
}

/**
 * Redmine's MembersController#update. Changing a member's roles used to require deleting
 * the membership and adding it back, which drops everything else the row carries.
 *
 * Two rules beyond `manage_members`:
 *
 * - A group-inherited row is not editable. In Redmine that is per role
 *   (MemberRole#inherited_from); here a group's grant is materialized as a whole separate
 *   member row, so Member#any_inherited_role? collapses to "this row came from a group" —
 *   `isMembershipEditable`. Such a row only changes by changing the group's membership.
 * - Only assignable (givable) roles may be set, so the builtin Non member / Anonymous roles
 *   cannot be handed to a real member through a crafted request.
 *
 * Editing a *group's* own membership row re-materializes the inherited rows of every user
 * in that group, or those users would keep the roles the group used to grant.
 */
export async function updateMemberRoles(
  repositories: UpdateMemberRolesRepositories,
  input: { memberId: string; roleIds: string[]; actor: AuthorizationActor },
): Promise<void> {
  const member = await repositories.memberRepository.findById(input.memberId);
  if (!member) {
    throw new Error(`Member ${input.memberId} not found`);
  }

  // The project comes from the membership record, never from the caller — the member id is
  // client-supplied, the same IDOR-safe pattern the memberships DELETE endpoint uses.
  const project = await repositories.projectRepository.findById(member.projectId);
  if (!project) {
    throw new Error(`Project ${member.projectId} not found`);
  }

  const permitted =
    can({ permission: "manage_members", project: projectAuthorizationContext(project), actor: input.actor }) &&
    isMembershipEditable(member);
  if (!permitted) {
    throw new UpdateMemberRolesNotPermittedError();
  }

  const roleIds = [...new Set(input.roleIds)];
  if (roleIds.length === 0) {
    throw new MemberRolesEmptyError();
  }
  const assignableIds = new Set((await repositories.roleRepository.listAssignable()).map((role) => role.id));
  if (roleIds.some((roleId) => !assignableIds.has(roleId))) {
    throw new MemberRolesInvalidError();
  }

  await repositories.memberAdminRepository.replaceRoles(member.id, roleIds);

  if (member.groupId) {
    const inherited = (await repositories.memberRepository.listByProject(member.projectId)).filter(
      (row) => row.inheritedFromMemberId === member.id,
    );
    for (const row of inherited) {
      await repositories.memberAdminRepository.replaceRoles(row.id, roleIds);
    }
  }
}
