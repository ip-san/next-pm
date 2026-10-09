import { encryptSecret } from "@/domain/crypto/symmetric";
import { validateLdapAuthSourceInput, type LdapAuthSource, type LdapAuthSourceInput } from "@/domain/ldap/auth-source";
import type { LdapAuthSourceRepository } from "@/domain/ldap/repository";

export class LdapAuthSourceError extends Error {}

/** The message when a bind password can't be stored because the encryption key isn't configured. */
export const LDAP_PASSWORD_KEY_MISSING = "LDAPのパスワードを保存するには、サーバーにTOTP_ENCRYPTION_KEYの設定が必要です。";

/**
 * Creates or updates an LDAP authentication source. A bind password is stored only encrypted, with the same key as
 * the TOTP secrets; without that key a password can't be saved, so the save is refused rather than storing it clear.
 */
export async function saveLdapAuthSource(
  repository: LdapAuthSourceRepository,
  encryptionKey: Buffer | null,
  input: LdapAuthSourceInput,
  existingId: string | null,
): Promise<LdapAuthSource> {
  const problem = validateLdapAuthSourceInput(input);
  if (problem) throw new LdapAuthSourceError(problem);

  // null: keep the stored password (edit with the field left blank); "": clear it; anything else: replace it.
  const encrypt = (password: string): string => {
    if (!encryptionKey) throw new LdapAuthSourceError(LDAP_PASSWORD_KEY_MISSING);
    return encryptSecret(password, encryptionKey);
  };
  try {
    if (existingId === null) {
      const encryptedPassword = input.password && input.password !== "" ? encrypt(input.password) : null;
      return await repository.create(input, encryptedPassword);
    }
    const encryptedPassword = input.password === null ? undefined : input.password === "" ? null : encrypt(input.password);
    return await repository.update(existingId, input, encryptedPassword);
  } catch (error) {
    // The name is unique; a second source with the same name is the admin's to rename, not an internal error.
    if (isUniqueViolation(error)) throw new LdapAuthSourceError("同じ名前の認証元が既にあります。");
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}
