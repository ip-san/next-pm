import { decryptSecret, encryptSecret } from "@/domain/crypto/symmetric";
import { generateBackupCodes, hashBackupCode } from "@/domain/twofa/backup-codes";
import type { TwofaBackupCodeRepository } from "@/domain/twofa/backup-code-repository";
import { generateTotpSecret, provisioningUri, verifyTotp } from "@/domain/twofa/totp";
import type { UserRepository } from "@/domain/user/repository";

export class TotpEncryptionKeyMissingError extends Error {}
export class UserNotFoundError extends Error {}

export interface TwofaRepositories {
  userRepository: UserRepository;
  backupCodeRepository: TwofaBackupCodeRepository;
}

/**
 * Starts (or restarts) a TOTP pairing: generates a fresh secret, encrypts it, and stores it —
 * but does NOT activate 2FA. twofaScheme stays whatever it was until confirmTotpPairing
 * succeeds, mirroring Redmine's Twofa::Totp#init_pairing! (which likewise only writes the key,
 * leaving activation to a separate confirm step).
 */
export async function startTotpPairing(
  repositories: Pick<TwofaRepositories, "userRepository">,
  userId: string,
  encryptionKey: Buffer | null,
  issuer: string,
): Promise<{ secretBase32: string; provisioningUri: string }> {
  if (!encryptionKey) {
    throw new TotpEncryptionKeyMissingError("TOTP_ENCRYPTION_KEY is not configured");
  }
  const user = await repositories.userRepository.findById(userId);
  if (!user) {
    throw new UserNotFoundError(userId);
  }

  const secretBase32 = generateTotpSecret();
  await repositories.userRepository.setTotpPairing(userId, encryptSecret(secretBase32, encryptionKey));
  return { secretBase32, provisioningUri: provisioningUri(secretBase32, user.login, issuer) };
}

export type ConfirmTotpPairingResult =
  | { ok: true; backupCodes: string[] }
  | { ok: false; reason: "no_pending_pairing" | "invalid_code" };

/**
 * Verifies the first code from a just-paired authenticator app, activates 2FA, and issues a
 * fresh batch of backup codes (replacing any from a previous pairing). The backup codes are
 * returned in plaintext exactly once here — callers must display them and never persist the
 * plaintext, only what hashBackupCode produces.
 */
export async function confirmTotpPairing(
  repositories: TwofaRepositories,
  userId: string,
  code: string,
  encryptionKey: Buffer | null,
  now: number,
): Promise<ConfirmTotpPairingResult> {
  if (!encryptionKey) {
    throw new TotpEncryptionKeyMissingError("TOTP_ENCRYPTION_KEY is not configured");
  }
  const user = await repositories.userRepository.findById(userId);
  if (!user || !user.twofaTotpKey) {
    return { ok: false, reason: "no_pending_pairing" };
  }

  const secretBase32 = decryptSecret(user.twofaTotpKey, encryptionKey);
  const result = verifyTotp(secretBase32, code, { now, lastUsedStep: null });
  if (!result.verified || result.step === null) {
    return { ok: false, reason: "invalid_code" };
  }

  await repositories.userRepository.confirmTotpPairing(userId, result.step);
  const backupCodes = generateBackupCodes();
  await repositories.backupCodeRepository.replaceForUser(userId, backupCodes.map(hashBackupCode));
  return { ok: true, backupCodes };
}

/** Fully removes 2FA: scheme, encrypted secret, replay floor, and every backup code. */
export async function deactivateTwofa(repositories: TwofaRepositories, userId: string): Promise<void> {
  await repositories.userRepository.clearTwofa(userId);
  await repositories.backupCodeRepository.deleteAllForUser(userId);
}
