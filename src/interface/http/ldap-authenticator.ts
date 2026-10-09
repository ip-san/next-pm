import { decryptSecret } from "@/domain/crypto/symmetric";
import type { LdapSource } from "@/domain/ldap/authenticator";
import { ldapConfigFromAuthSource, loadLdapConfigFromEnv } from "@/domain/ldap/config";
import { loadTotpEncryptionKeyFromEnv } from "@/domain/twofa/encryption-key";
import { LdaptsAuthenticator } from "@/infrastructure/ldap/ldapts-authenticator";
import { DrizzleLdapAuthSourceRepository } from "@/infrastructure/db/repositories/ldap-auth-source-repository";

/**
 * Every LDAP source a sign-in may be checked against: the environment-configured one (id null), then each admin-managed
 * one by name. A source whose stored bind password can't be decrypted (no key, or a key that doesn't fit) is left out
 * rather than used without its password. Empty when there is no source, so sign-in is local-only.
 */
export async function ldapSourcesFromConfiguration(env: Record<string, string | undefined>): Promise<LdapSource[]> {
  const sources: LdapSource[] = [];
  const fromEnv = loadLdapConfigFromEnv(env);
  if (fromEnv) sources.push({ id: null, authenticator: new LdaptsAuthenticator(fromEnv) });

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
    sources.push({ id: source.id, authenticator: new LdaptsAuthenticator(ldapConfigFromAuthSource(source, password)) });
  }
  return sources;
}
