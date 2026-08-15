import { generateSalt, hashPassword } from "@/domain/user/password";
import type { UserRepository } from "@/domain/user/repository";
import type { PasswordResetTokenRepository } from "@/domain/password-reset/repository";
import { hashResetToken } from "./request-password-reset";
import { InvalidPasswordError } from "./change-password";

export { InvalidPasswordError };
export class InvalidResetTokenError extends Error {}

/**
 * Mirrors the confirm half of Redmine's AccountController#lost_password: validates the token
 * from the mailed link (hashed lookup, not-expired), sets a new password with no current-
 * password check (the token itself is the proof of ownership), then consumes the token so the
 * link can't be reused.
 */
export async function resetPassword(
  repositories: { userRepository: UserRepository; passwordResetTokenRepository: PasswordResetTokenRepository },
  token: string,
  newPassword: string,
): Promise<void> {
  const resetToken = await repositories.passwordResetTokenRepository.findByTokenHash(hashResetToken(token));
  if (!resetToken || resetToken.expiresAt.getTime() < Date.now()) {
    throw new InvalidResetTokenError("リンクが無効か、有効期限が切れています。もう一度パスワード再設定をお試しください。");
  }
  if (newPassword.length < 8) {
    throw new InvalidPasswordError("パスワードは8文字以上で入力してください。");
  }

  const salt = generateSalt();
  const hash = hashPassword(newPassword, salt);
  await repositories.userRepository.updatePassword(resetToken.userId, hash, salt);
  await repositories.passwordResetTokenRepository.delete(resetToken.id);
}
