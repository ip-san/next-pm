import { loadLdapConfigFromEnv } from "@/domain/ldap/config";
import type { LdapAuthSourceRepository } from "@/domain/ldap/repository";

/**
 * What the admin user form may offer in its authentication-mode select: the environment source
 * only when LDAP_HOST is set, plus every admin-managed source by name.
 */
export async function loadAuthModeOptions(
  ldapAuthSourceRepository: LdapAuthSourceRepository,
  env: Record<string, string | undefined>,
): Promise<{ envLdapConfigured: boolean; ldapSources: { id: string; name: string }[] }> {
  const sources = await ldapAuthSourceRepository.listAll();
  return {
    envLdapConfigured: loadLdapConfigFromEnv(env) !== null,
    ldapSources: sources.map((source) => ({ id: source.id, name: source.name })),
  };
}
