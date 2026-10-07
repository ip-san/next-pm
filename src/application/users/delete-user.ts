import { isAnonymousUser } from "@/domain/user/entity";
import type { UserAdminRepository, UserRepository } from "@/domain/user/repository";

export class UserNotDeletableError extends Error {}

export interface DeleteUserRepositories {
  userRepository: UserRepository;
  userAdminRepository: UserAdminRepository;
}

/**
 * Mirrors UsersController#destroy plus User#remove_references_before_destroy: the account row
 * goes, but what it authored does not — it is handed to the AnonymousUser placeholder, which
 * is found or created on demand (`User.anonymous`).
 *
 * Redmine refuses to let the current user delete their own account from this screen
 * (`@user == User.current && !own_account_deletable?`), and the AnonymousUser itself is never
 * a target.
 */
export async function deleteUser(
  repositories: DeleteUserRepositories,
  userId: string,
  currentUserId: string,
): Promise<void> {
  const { userRepository, userAdminRepository } = repositories;

  if (userId === currentUserId) {
    throw new UserNotDeletableError("自分自身のアカウントはこの画面から削除できません。");
  }

  const user = await userRepository.findById(userId);
  if (!user) {
    throw new UserNotDeletableError("ユーザーが見つかりません。");
  }
  if (isAnonymousUser(user)) {
    throw new UserNotDeletableError("匿名ユーザーは削除できません。");
  }

  const anonymous = await userAdminRepository.findOrCreateAnonymous();
  await userAdminRepository.reassignReferencesAndDelete(user.id, anonymous.id);
}
