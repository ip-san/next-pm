import type { LdapAuthenticator, LdapUserAttributes } from "@/domain/ldap/authenticator";

/**
 * Tries each LDAP source in turn and returns the first that accepts the login. Several sources are allowed (the
 * environment-configured one plus the admin-managed ones), as Redmine lets a user be checked against any source.
 */
export class CombinedLdapAuthenticator implements LdapAuthenticator {
  constructor(private readonly authenticators: LdapAuthenticator[]) {}

  async authenticate(login: string, password: string): Promise<LdapUserAttributes | null> {
    for (const authenticator of this.authenticators) {
      const attributes = await authenticator.authenticate(login, password);
      if (attributes) return attributes;
    }
    return null;
  }
}
