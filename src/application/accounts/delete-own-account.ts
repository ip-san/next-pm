import { ownAccountDeletable } from "@/domain/user/account-deletion";
import { isActiveUser } from "@/domain/user/entity";
import type { UserAdminRepository, UserRepository } from "@/domain/user/repository";

export class AccountNotDeletableError extends Error {}

export interface DeleteOwnAccountRepositories {
  userRepository: UserRepository;
  userAdminRepository: UserAdminRepository;
}

/**
 * Mirrors Redmine's MyController#destroy — the only path that permits deleting your own
 * account, gated on Setting.unsubscribe via User#own_account_deletable?.
 *
 * Deliberately does NOT call the admin-screen deleteUser use case: that one refuses when the
 * target is the acting user, faithfully, because Redmine's UsersController#destroy refuses it
 * too. The two paths share the repository primitives, not the policy.
 *
 * The caller owns the session teardown afterwards (Redmine's logout_user).
 */
export async function deleteOwnAccount(
  repositories: DeleteOwnAccountRepositories,
  userId: string,
  unsubscribeEnabled: boolean,
): Promise<void> {
  const { userRepository, userAdminRepository } = repositories;

  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AccountNotDeletableError("ユーザーが見つかりません。");
  }

  // Redmine counts User.active.admin excluding this one; listAll() already omits the
  // anonymous placeholder, so the only filtering left is "active, admin, not me".
  const otherActiveAdminExists = (await userRepository.listAll()).some(
    (candidate) => candidate.id !== user.id && candidate.isAdmin && isActiveUser(candidate),
  );
  if (!ownAccountDeletable(user, unsubscribeEnabled, otherActiveAdminExists)) {
    throw new AccountNotDeletableError("このアカウントは削除できません。");
  }

  // Authored content outlives the account, reassigned to Redmine's AnonymousUser placeholder —
  // the FKs from issues, journals, attachments and the rest are RESTRICT, so there is no
  // "just delete it" path. Reassignment and removal are one transaction inside the repository.
  const anonymous = await userAdminRepository.findOrCreateAnonymous();
  await userAdminRepository.reassignReferencesAndDelete(user.id, anonymous.id);
}
