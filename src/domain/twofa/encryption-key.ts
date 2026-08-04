import { SYMMETRIC_KEY_LENGTH } from "@/domain/crypto/symmetric";

/**
 * Loads the key used to encrypt TOTP secrets at rest. Deliberately stricter than Redmine's
 * Ciphering module, which silently stores the secret in PLAINTEXT if database_cipher_key is
 * left unconfigured — that's an easy-to-miss gotcha the research for this feature flagged.
 * Here: unset means "2FA pairing is unavailable" (callers must refuse to start a pairing, never
 * fall back to storing an unencrypted secret); a set-but-invalid value throws immediately at
 * startup rather than failing silently later.
 */
export function loadTotpEncryptionKeyFromEnv(env: Record<string, string | undefined>): Buffer | null {
  const raw = env.TOTP_ENCRYPTION_KEY?.trim();
  if (!raw) {
    return null;
  }
  if (!/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error("TOTP_ENCRYPTION_KEY must be a hex string");
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== SYMMETRIC_KEY_LENGTH) {
    throw new Error(
      `TOTP_ENCRYPTION_KEY must decode to ${SYMMETRIC_KEY_LENGTH} bytes (${SYMMETRIC_KEY_LENGTH * 2} hex characters), got ${key.length}`,
    );
  }
  return key;
}
