import { isBuiltinRole } from "@/domain/role/entity";
import type { RoleAdminRepository, RoleRepository } from "@/domain/role/repository";

export class RoleNotDeletableError extends Error {}

/**
 * Mirrors Role#check_deletable, which refuses on two counts: the role is still given to a
 * project member, or it is one of the builtin roles (Non member / Anonymous), which Redmine
 * recreates on the fly and therefore never lets you remove.
 *
 * The membership check matters beyond parity here: member_roles cascades on its role FK, so
 * without it deleting a role would silently strip memberships instead of failing.
 */
export async function deleteRole(
  repositories: { roleRepository: RoleRepository; roleAdminRepository: RoleAdminRepository },
  roleId: string,
): Promise<void> {
  const role = await repositories.roleRepository.findById(roleId);
  if (!role) {
    throw new RoleNotDeletableError("ロールが見つかりません。");
  }
  if (isBuiltinRole(role)) {
    throw new RoleNotDeletableError("組み込みロールは削除できません。");
  }

  const membershipCount = await repositories.roleAdminRepository.countMemberships(roleId);
  if (membershipCount > 0) {
    throw new RoleNotDeletableError("このロールが割り当てられたメンバーがいるため削除できません。");
  }

  await repositories.roleAdminRepository.delete(roleId);
}
