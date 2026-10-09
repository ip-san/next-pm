import { decryptSecret } from "@/domain/crypto/symmetric";
import type { LdapAuthenticator } from "@/domain/ldap/authenticator";
import { ldapConfigFromAuthSource, loadLdapConfigFromEnv, type LdapConfig } from "@/domain/ldap/config";
import { loadTotpEncryptionKeyFromEnv } from "@/domain/twofa/encryption-key";
import { CombinedLdapAuthenticator } from "@/infrastructure/ldap/combined-authenticator";
import { LdaptsAuthenticator } from "@/infrastructure/ldap/ldapts-authenticator";
import { DrizzleLdapAuthSourceRepository } from "@/infrastructure/db/repositories/ldap-auth-source-repository";

/**
 * Every LDAP source a sign-in may be checked against: the environment-configured one, then the admin-managed ones.
 * A source whose stored bind password can't be decrypted (no key, or a key that doesn't fit) is left out rather than
 * used without its password. Returns null when there is no source at all, so sign-in is local-only.
 */
export async function ldapAuthenticatorFromConfiguration(env: Record<string, string | undefined>): Promise<LdapAuthenticator | null> {
  const configs: LdapConfig[] = [];
  const fromEnv = loadLdapConfigFromEnv(env);
  if (fromEnv) configs.push(fromEnv);

  const key = loadTotpEncryptionKeyFromEnv(env);
  for (const { source, encryptedPassword } of await new DrizzleLdapAuthSourceRepository().listWithEncryptedPasswords()) {
    if (encryptedPassword !== null && key === null) continue;
    let password: string | null = null;
    if (encryptedPassword !== null && key !== null) {
      try {
        password = decryptSecret(encryptedPassword, key);
      } catch {
        // A stored password that doesn't decrypt under this key (rotated or wrong key) leaves the source out.
        continue;
      }
    }
    configs.push(ldapConfigFromAuthSource(source, password));
  }

  if (configs.length === 0) return null;
  return new CombinedLdapAuthenticator(configs.map((config) => new LdaptsAuthenticator(config)));
}
