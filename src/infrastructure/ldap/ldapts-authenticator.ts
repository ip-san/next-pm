import { Client, InvalidCredentialsError, ResultCodeError } from "ldapts";
import type { LdapConfig } from "@/domain/ldap/config";
import type { LdapAuthenticator, LdapUserAttributes } from "@/domain/ldap/authenticator";
import { loginSearchFilter, substituteLoginInAccount } from "@/domain/ldap/dn";

function firstAttributeValue(value: string | string[] | Buffer | Buffer[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value;
  if (first === undefined) return "";
  return Buffer.isBuffer(first) ? first.toString("utf8") : first;
}

/**
 * Mirrors AuthSourceLdap#authenticate: a two-step bind. First, find the target user's real DN
 * (either via an anonymous/service-account search, or — when `account` contains "$login" — by
 * binding directly as the user's own would-be DN). Second, re-bind explicitly as whatever DN the
 * search actually returned, with the supplied password — this is the real authentication check;
 * the first bind (in the "$login" case) only proves the *template* DN accepted the password, not
 * necessarily the same DN the directory considers canonical for that entry.
 *
 * NOT independently verified against a real directory server — this environment has none
 * available, unlike every other feature verified this session. The DN/filter escaping and the
 * login integration logic (application/auth/login.ts) are unit-tested; the actual wire protocol
 * exchange with an LDAP server is not.
 */
export class LdaptsAuthenticator implements LdapAuthenticator {
  constructor(private readonly config: LdapConfig) {}

  async authenticate(login: string, password: string): Promise<LdapUserAttributes | null> {
    if (!login || !password) return null;

    const searchClient = this.newClient();
    let dn: string;
    let attrs: LdapUserAttributes;
    try {
      if (this.config.account?.includes("$login")) {
        await searchClient.bind(substituteLoginInAccount(this.config.account, login), password);
      } else if (this.config.account) {
        await searchClient.bind(this.config.account, this.config.accountPassword ?? "");
      }

      const { searchEntries } = await searchClient.search(this.config.baseDn, {
        scope: "sub",
        filter: loginSearchFilter(this.config.attrLogin, login, this.config.filter),
        attributes: [this.config.attrFirstname, this.config.attrLastname, this.config.attrMail],
      });
      const entry = searchEntries[0];
      if (!entry) return null;

      dn = entry.dn;
      attrs = {
        firstname: firstAttributeValue(entry[this.config.attrFirstname]),
        lastname: firstAttributeValue(entry[this.config.attrLastname]),
        mail: firstAttributeValue(entry[this.config.attrMail]),
        onthefly: this.config.onthefly,
      };
    } catch {
      return null;
    } finally {
      await searchClient.unbind().catch(() => {});
    }

    const bindClient = this.newClient();
    try {
      await bindClient.bind(dn, password);
      return attrs;
    } catch {
      return null;
    } finally {
      await bindClient.unbind().catch(() => {});
    }
  }

  /**
   * Mirrors AuthSourceLdap#test_connection: opens a connection and, when the source has a service account (one without
   * "$login") and its password, binds as it. Resolves when that works and rejects with the reason otherwise. Without a
   * service account the connection is opened with an anonymous bind, and a directory that answers by refusing that
   * bind still counts as reachable.
   */
  async testConnection(): Promise<void> {
    const client = this.newClient();
    try {
      const account = this.config.account;
      if (account && !account.includes("$login") && this.config.accountPassword) {
        try {
          await client.bind(account, this.config.accountPassword);
        } catch (error) {
          // Redmine's error_ldap_bind_credentials.
          if (error instanceof InvalidCredentialsError) throw new Error("Invalid LDAP Account/Password");
          throw error;
        }
        return;
      }
      try {
        await client.bind("", "");
      } catch (error) {
        if (!(error instanceof ResultCodeError)) throw error;
      }
    } finally {
      await client.unbind().catch(() => {});
    }
  }

  private newClient(): Client {
    return new Client({
      url: this.config.url,
      // Redmine's with_timeout wraps the test in the source's timeout; a host that never answers fails here instead
      // of holding the admin's request open.
      connectTimeout: 10_000,
      timeout: 10_000,
      // ldapts switches to TLS whenever tlsOptions holds a value, even for an ldap:// URL, so they are only given for
      // ldaps://. Passing them always made every plain-LDAP connection attempt a TLS handshake.
      ...(this.config.url.startsWith("ldaps:") ? { tlsOptions: { rejectUnauthorized: this.config.verifyPeer } } : {}),
    });
  }
}
