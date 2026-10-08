import { generateSalt, hashPassword } from "@/domain/user/password";
import { describePasswordPolicyFailure, type PasswordPolicy } from "@/domain/user/password-policy";
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
  policy: PasswordPolicy,
): Promise<{ userId: string }> {
  const resetToken = await repositories.passwordResetTokenRepository.findByTokenHash(hashResetToken(token));
  if (!resetToken || resetToken.expiresAt.getTime() < Date.now()) {
    throw new InvalidResetTokenError("リンクが無効か、有効期限が切れています。もう一度パスワード再設定をお試しください。");
  }

  const user = await repositories.userRepository.findById(resetToken.userId);
  const policyFailure = describePasswordPolicyFailure(
    newPassword,
    policy,
    user ? { login: user.login, firstname: user.firstname, lastname: user.lastname, mails: [user.mail] } : {},
  );
  if (policyFailure) {
    throw new InvalidPasswordError(policyFailure);
  }

  const salt = generateSalt();
  const hash = hashPassword(newPassword, salt);
  await repositories.userRepository.updatePassword(resetToken.userId, hash, salt);
  await repositories.passwordResetTokenRepository.delete(resetToken.id);
  // The caller must also revoke the user's sessions and remember-me cookies (Redmine's
  // User#destroy_tokens) — returning the id rather than taking those repositories keeps this
  // use case to the one job the mailed link is about.
  return { userId: resetToken.userId };
}
