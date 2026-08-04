import { isActiveUser, isTwofaActive } from "@/domain/user/entity";
import { verifyPassword } from "@/domain/user/password";
import type { UserRepository } from "@/domain/user/repository";
import type { User } from "@/domain/user/entity";
import type { LdapAuthenticator } from "@/domain/ldap/authenticator";

export type LoginResult =
  | { ok: true; twofaRequired: false; user: User }
  | { ok: true; twofaRequired: true; user: User }
  | { ok: false; reason: "invalid_credentials" | "account_not_active" };

export interface LoginRepositories {
  userRepository: UserRepository;
  /** Null when LDAP isn't configured — local-only authentication, matching today's behavior. */
  ldapAuthenticator: LdapAuthenticator | null;
}

/**
 * Mirrors Redmine's User.try_to_login!: a local account tied to LDAP (authSource === "ldap")
 * always has its password checked against the directory, never the local hash — the local
 * passwordHash/passwordSalt are empty strings for such a user (see schema/users.ts) and would
 * never match anyway. A login with no local record falls back to LDAP on-the-fly registration:
 * on a successful bind, a new local user is created from the directory's attributes.
 */
export async function login(repositories: LoginRepositories, loginName: string, clearPassword: string): Promise<LoginResult> {
  const user = await repositories.userRepository.findByLogin(loginName);

  if (user) {
    const authenticated =
      user.authSource === "ldap"
        ? repositories.ldapAuthenticator !== null && (await repositories.ldapAuthenticator.authenticate(loginName, clearPassword)) !== null
        : verifyPassword(clearPassword, user.passwordSalt, user.passwordHash);
    if (!authenticated) {
      return { ok: false, reason: "invalid_credentials" };
    }
    if (!isActiveUser(user)) {
      return { ok: false, reason: "account_not_active" };
    }
    return isTwofaActive(user) ? { ok: true, twofaRequired: true, user } : { ok: true, twofaRequired: false, user };
  }

  if (!repositories.ldapAuthenticator) {
    return { ok: false, reason: "invalid_credentials" };
  }
  const attrs = await repositories.ldapAuthenticator.authenticate(loginName, clearPassword);
  if (!attrs) {
    return { ok: false, reason: "invalid_credentials" };
  }
  if (!attrs.mail) {
    // Can't provision a local account without an email address — the column is unique and
    // not-null, and there's no sane placeholder to fall back to.
    return { ok: false, reason: "invalid_credentials" };
  }

  const created = await repositories.userRepository.create({
    login: loginName,
    mail: attrs.mail,
    firstname: attrs.firstname || loginName,
    lastname: attrs.lastname || "-",
    isAdmin: false,
    status: "active",
    passwordHash: "",
    passwordSalt: "",
    mustChangePassword: false,
    apiKey: null,
    atomKey: null,
    authSource: "ldap",
    twofaScheme: null,
    twofaTotpKey: null,
    twofaTotpLastUsedStep: null,
  });
  return { ok: true, twofaRequired: false, user: created };
}
