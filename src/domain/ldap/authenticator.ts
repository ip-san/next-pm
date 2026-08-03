export interface LdapUserAttributes {
  firstname: string;
  lastname: string;
  mail: string;
}

/** Infrastructure implements this against a real directory; application/interface code only ever sees the port. */
export interface LdapAuthenticator {
  /** Binds as the given login/password against the configured directory. Null on any failure — wrong password, unknown login, or a directory/network error. */
  authenticate(login: string, password: string): Promise<LdapUserAttributes | null>;
}
