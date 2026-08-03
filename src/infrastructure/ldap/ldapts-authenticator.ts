import { Client } from "ldapts";
import type { LdapConfig } from "@/domain/ldap/config";
import type { LdapAuthenticator, LdapUserAttributes } from "@/domain/ldap/authenticator";
import { escapeLdapFilterValue, substituteLoginInAccount } from "@/domain/ldap/dn";

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
        filter: `(${this.config.attrLogin}=${escapeLdapFilterValue(login)})`,
        attributes: [this.config.attrFirstname, this.config.attrLastname, this.config.attrMail],
      });
      const entry = searchEntries[0];
      if (!entry) return null;

      dn = entry.dn;
      attrs = {
        firstname: firstAttributeValue(entry[this.config.attrFirstname]),
        lastname: firstAttributeValue(entry[this.config.attrLastname]),
        mail: firstAttributeValue(entry[this.config.attrMail]),
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

  private newClient(): Client {
    return new Client({
      url: this.config.url,
      tlsOptions: { rejectUnauthorized: this.config.verifyPeer },
    });
  }
}
