export interface LdapConfig {
  url: string;
  /** Bind DN for searching, or a template containing "$login" to bind as the user themself. */
  account: string | null;
  accountPassword: string | null;
  baseDn: string;
  attrLogin: string;
  attrFirstname: string;
  attrLastname: string;
  attrMail: string;
  /** Verify the server's TLS certificate (only meaningful when the url is ldaps://). */
  verifyPeer: boolean;
}

/**
 * Mirrors AuthSourceLdap's configuration fields, sourced from environment variables rather
 * than an admin-managed database table (this app supports at most one configured LDAP source,
 * not Redmine's arbitrary number of AuthSource records). Returns null — meaning LDAP is
 * disabled — whenever LDAP_HOST is unset, never falling back to a default host.
 */
export function loadLdapConfigFromEnv(env: Record<string, string | undefined>): LdapConfig | null {
  const host = env.LDAP_HOST?.trim();
  if (!host) {
    return null;
  }

  const port = Number(env.LDAP_PORT ?? "389");
  const scheme = env.LDAP_TLS === "1" ? "ldaps" : "ldap";

  return {
    url: `${scheme}://${host}:${Number.isFinite(port) ? port : 389}`,
    account: env.LDAP_ACCOUNT?.trim() || null,
    accountPassword: env.LDAP_ACCOUNT_PASSWORD || null,
    baseDn: env.LDAP_BASE_DN?.trim() ?? "",
    attrLogin: env.LDAP_ATTR_LOGIN?.trim() || "uid",
    attrFirstname: env.LDAP_ATTR_FIRSTNAME?.trim() || "givenName",
    attrLastname: env.LDAP_ATTR_LASTNAME?.trim() || "sn",
    attrMail: env.LDAP_ATTR_MAIL?.trim() || "mail",
    verifyPeer: env.LDAP_TLS_VERIFY !== "0",
  };
}
