export interface LdapUserAttributes {
  firstname: string;
  lastname: string;
  mail: string;
  /** Whether the source that authenticated the user allows creating an account on first sign-in. */
  onthefly: boolean;
}

/** Infrastructure implements this against a real directory; application/interface code only ever sees the port. */
export interface LdapAuthenticator {
  /** Binds as the given login/password against the configured directory. Null on any failure — wrong password, unknown login, or a directory/network error. */
  authenticate(login: string, password: string): Promise<LdapUserAttributes | null>;
}

/**
 * One LDAP source a sign-in can be checked against. `id` is the admin-managed source's id, or null for the
 * environment-configured source. A user created through a source is checked against that source alone.
 */
export interface LdapSource {
  id: string | null;
  authenticator: LdapAuthenticator;
}

/** The source a user was created through: `userSourceId` null means the environment source. Undefined when it's gone. */
export function ldapSourceForUser(sources: readonly LdapSource[], userSourceId: string | null): LdapSource | undefined {
  return sources.find((source) => source.id === userSourceId);
}
