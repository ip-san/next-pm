import { isAnonymousUser, type UserStatus } from "@/domain/user/entity";
import type { UserAdminRepository, UserRepository } from "@/domain/user/repository";

export class UserStatusChangeError extends Error {}

export interface ChangeUserStatusRepositories {
  userRepository: UserRepository;
  userAdminRepository: UserAdminRepository;
}

/**
 * Mirrors User#activate! / #lock! / #register!, driven from the admin screen.
 *
 * "activate" covers both of Redmine's uses of STATUS_ACTIVE: approving a registered account
 * and unlocking a locked one. An admin can never lock themselves out
 * (UsersController#bulk_update_status excludes User.current), and the AnonymousUser
 * placeholder has no status to change.
 */
export async function changeUserStatus(
  repositories: ChangeUserStatusRepositories,
  userId: string,
  status: Exclude<UserStatus, "anonymous">,
  currentUserId: string,
): Promise<void> {
  const { userRepository, userAdminRepository } = repositories;

  const user = await userRepository.findById(userId);
  if (!user || isAnonymousUser(user)) {
    throw new UserStatusChangeError("ユーザーが見つかりません。");
  }
  if (user.id === currentUserId && status !== "active") {
    throw new UserStatusChangeError("自分自身のアカウントはロックできません。");
  }

  await userAdminRepository.updateStatus(user.id, status);
}
