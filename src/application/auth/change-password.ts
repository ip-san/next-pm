import { generateSalt, hashPassword, verifyPassword } from "@/domain/user/password";
import type { UserRepository } from "@/domain/user/repository";

export class LdapPasswordChangeNotAllowedError extends Error {}
export class CurrentPasswordMismatchError extends Error {}
export class InvalidPasswordError extends Error {}

export interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

/**
 * Mirrors Redmine's AccountController#change_password. An LDAP user's local passwordHash/Salt
 * are empty strings by construction (see users.ts schema comment) — writing a new local hash
 * for them would silently do nothing, since login() always delegates to LDAP for such a user.
 * So this rejects authSource !== null up front, before even checking the current password,
 * rather than reusing verify-current-password.ts's LDAP-delegating check.
 */
export async function changePassword(repositories: { userRepository: UserRepository }, input: ChangePasswordInput): Promise<void> {
  const user = await repositories.userRepository.findById(input.userId);
  if (!user) {
    throw new CurrentPasswordMismatchError("ユーザーが見つかりません。");
  }
  if (user.authSource === "ldap") {
    throw new LdapPasswordChangeNotAllowedError("LDAP認証のアカウントはパスワードを変更できません。");
  }
  if (input.newPassword.length < 8) {
    throw new InvalidPasswordError("パスワードは8文字以上で入力してください。");
  }
  if (!verifyPassword(input.currentPassword, user.passwordSalt, user.passwordHash)) {
    throw new CurrentPasswordMismatchError("現在のパスワードが正しくありません。");
  }

  const salt = generateSalt();
  const hash = hashPassword(input.newPassword, salt);
  await repositories.userRepository.updatePassword(user.id, hash, salt);
}
