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
  /** An extra LDAP filter every match must also satisfy, or null. */
  filter: string | null;
  /** Whether this source may create an account on a first successful sign-in. */
  onthefly: boolean;
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
    filter: null,
    // The environment-configured source is the one that always provisioned accounts on first sign-in.
    onthefly: true,
  };
}

/** The connection settings for an admin-managed LDAP source, with its bind password already decrypted (or null). */
export function ldapConfigFromAuthSource(
  source: {
    host: string;
    port: number;
    account: string | null;
    baseDn: string;
    attrLogin: string;
    attrFirstname: string;
    attrLastname: string;
    attrMail: string;
    tls: boolean;
    verifyPeer: boolean;
    onthefly: boolean;
    filter: string | null;
  },
  accountPassword: string | null,
): LdapConfig {
  return {
    url: `${source.tls ? "ldaps" : "ldap"}://${source.host}:${source.port}`,
    account: source.account,
    accountPassword,
    baseDn: source.baseDn,
    attrLogin: source.attrLogin,
    attrFirstname: source.attrFirstname,
    attrLastname: source.attrLastname,
    attrMail: source.attrMail,
    verifyPeer: source.verifyPeer,
    filter: source.filter,
    onthefly: source.onthefly,
  };
}
