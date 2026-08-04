import { decryptSecret } from "@/domain/crypto/symmetric";
import { hashBackupCode } from "@/domain/twofa/backup-codes";
import { verifyTotp } from "@/domain/twofa/totp";
import type { TwofaRepositories } from "./pairing";

export interface VerifyTwofaCodeResult {
  verified: boolean;
  method: "totp" | "backup_code" | null;
}

/**
 * Verifies a single code from the login-time second-factor prompt against either a live TOTP
 * code or a one-time backup code — mirrors Redmine's Twofa::Base#verify! (verify_otp! ||
 * verify_backup_code!). The backup-code check runs FIRST and never touches the encrypted TOTP
 * secret: if TOTP_ENCRYPTION_KEY is ever rotated or lost, backup codes must still work, since
 * they're the only way back in for an already-enrolled user in that scenario. A TOTP decrypt
 * failure (wrong/missing key, corrupted ciphertext) is treated as "not verified" rather than
 * thrown, so it can never crash the login route — only the caller's error message should say
 * whether the input was rejected as wrong or unusable.
 */
export async function verifyTwofaCode(
  repositories: TwofaRepositories,
  userId: string,
  code: string,
  encryptionKey: Buffer | null,
  now: number,
): Promise<VerifyTwofaCodeResult> {
  const backupCodeMatched = await repositories.backupCodeRepository.consumeIfMatches(userId, hashBackupCode(code));
  if (backupCodeMatched) {
    return { verified: true, method: "backup_code" };
  }

  const user = await repositories.userRepository.findById(userId);
  if (!user || user.twofaScheme !== "totp" || !user.twofaTotpKey || !encryptionKey) {
    return { verified: false, method: null };
  }

  let secretBase32: string;
  try {
    secretBase32 = decryptSecret(user.twofaTotpKey, encryptionKey);
  } catch {
    return { verified: false, method: null };
  }

  const result = verifyTotp(secretBase32, code, { now, lastUsedStep: user.twofaTotpLastUsedStep });
  if (!result.verified || result.step === null) {
    return { verified: false, method: null };
  }

  await repositories.userRepository.updateTwofaLastUsedStep(userId, result.step);
  return { verified: true, method: "totp" };
}
