/** The value of the admin user form's authentication-mode select, written as the auth_source_id select is in Redmine. */
export const INTERNAL_AUTH_MODE = "";
/** The environment-configured LDAP source (LDAP_HOST). Admin-managed sources are addressed by their id. */
export const ENV_LDAP_AUTH_MODE = "env";

/** The two columns an authentication mode writes: users.auth_source and users.ldap_auth_source_id. */
export type AuthModeChoice =
  | { authSource: null; ldapAuthSourceId: null }
  | { authSource: "ldap"; ldapAuthSourceId: null }
  | { authSource: "ldap"; ldapAuthSourceId: string };

export interface AuthModeOptions {
  /** Whether the environment-configured LDAP source is set up. */
  envLdapConfigured: boolean;
  /** Ids of the admin-managed LDAP sources that may be chosen. */
  ldapSourceIds: readonly string[];
}

export type AuthModeResolution = { ok: true; choice: AuthModeChoice } | { ok: false; error: string };

/**
 * Maps a submitted authentication mode onto the two columns it stands for, refusing anything the
 * form could not have offered. The environment source is accepted only when it is configured, and
 * an admin-managed source only when its id is one that exists — a forged id never reaches the write.
 */
export function resolveAuthModeChoice(submitted: string, options: AuthModeOptions): AuthModeResolution {
  if (submitted === INTERNAL_AUTH_MODE) {
    return { ok: true, choice: { authSource: null, ldapAuthSourceId: null } };
  }
  if (submitted === ENV_LDAP_AUTH_MODE) {
    if (!options.envLdapConfigured) {
      return { ok: false, error: "環境変数で設定されたLDAP認証元がないため、その認証方式は選択できません。" };
    }
    return { ok: true, choice: { authSource: "ldap", ldapAuthSourceId: null } };
  }
  if (options.ldapSourceIds.includes(submitted)) {
    return { ok: true, choice: { authSource: "ldap", ldapAuthSourceId: submitted } };
  }
  return { ok: false, error: "選択された認証方式が見つかりません。" };
}
