import { verifyPassword } from "@/domain/user/password";
import { evaluateLoginGate, type LoginGateOutcome } from "@/domain/user/login-gate";
import type { UserRepository } from "@/domain/user/repository";
import type { User } from "@/domain/user/entity";
import type { TwofaMode } from "@/domain/settings/auth-settings";
import { ldapSourceForUser, type LdapSource, type LdapUserAttributes } from "@/domain/ldap/authenticator";

export type LoginResult =
  /** The password (or LDAP bind) was wrong — deliberately indistinguishable from "no such login". */
  | { ok: false; reason: "invalid_credentials" }
  /**
   * The credentials were right. `outcome` says whether that is enough to hand out a session:
   * the caller must not do so unless it is "allowed". Mirrors Redmine's split between
   * password_authentication (credentials) and handle_active_user/handle_inactive_user (gate).
   */
  | { ok: true; user: User; outcome: LoginGateOutcome };

export interface LoginRepositories {
  userRepository: UserRepository;
  /** The LDAP sources a sign-in may be checked against; empty when LDAP isn't configured (local-only sign-in). */
  ldapSources: LdapSource[];
}

/**
 * Mirrors Redmine's User.try_to_login!: a local account tied to LDAP (authSource === "ldap")
 * always has its password checked against the directory, never the local hash — the local
 * passwordHash/passwordSalt are empty strings for such a user (see schema/users.ts) and would
 * never match anyway. An LDAP account is checked against the source that created it and no other:
 * another source accepting the same login doesn't prove it is this user. A login with no local
 * record falls back to LDAP on-the-fly registration: the first source that accepts it, if it allows
 * on-the-fly registration, creates a local user from the directory's attributes, linked to that source.
 */
export async function login(
  repositories: LoginRepositories,
  loginName: string,
  clearPassword: string,
  twofa: TwofaMode,
): Promise<LoginResult> {
  const user = await repositories.userRepository.findByLogin(loginName);

  if (user) {
    const createdBy = user.authSource === "ldap" ? ldapSourceForUser(repositories.ldapSources, user.ldapAuthSourceId) : undefined;
    const authenticated =
      user.authSource === "ldap"
        ? createdBy !== undefined && (await createdBy.authenticator.authenticate(loginName, clearPassword)) !== null
        : verifyPassword(clearPassword, user.passwordSalt, user.passwordHash);
    if (!authenticated) {
      return { ok: false, reason: "invalid_credentials" };
    }
    return { ok: true, user, outcome: evaluateLoginGate(user, twofa) };
  }

  for (const source of repositories.ldapSources) {
    const attrs = await source.authenticator.authenticate(loginName, clearPassword);
    if (attrs) {
      return provisionLdapUser(repositories, source, loginName, attrs, twofa);
    }
  }
  return { ok: false, reason: "invalid_credentials" };
}

async function provisionLdapUser(
  repositories: LoginRepositories,
  source: LdapSource,
  loginName: string,
  attrs: LdapUserAttributes,
  twofa: TwofaMode,
): Promise<LoginResult> {
  // A source that doesn't allow on-the-fly registration signs an existing account in, but never creates one.
  if (!attrs.onthefly) {
    return { ok: false, reason: "invalid_credentials" };
  }
  if (!attrs.mail) {
    // Can't provision a local account without an email address — the column is unique and
    // not-null, and there's no sane placeholder to fall back to.
    return { ok: false, reason: "invalid_credentials" };
  }
  // The directory handed us an address someone here already holds — as their default address
  // or as one of their additional ones (findByMail covers both). Creating the account anyway
  // would either violate the unique constraint or, for an additional address, quietly produce
  // two accounts reachable by the same address.
  if (await repositories.userRepository.findByMail(attrs.mail)) {
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
    language: null,
    mailNotification: "all",
    mustChangePassword: false,
    apiKey: null,
    atomKey: null,
    authSource: "ldap",
    ldapAuthSourceId: source.id,
    twofaScheme: null,
    twofaTotpKey: null,
    twofaTotpLastUsedStep: null,
  });
  // A freshly provisioned LDAP account is active with no second factor, but it still goes
  // through the same gate rather than being waved past it: the twofa setting may require one.
  return { ok: true, user: created, outcome: evaluateLoginGate(created, twofa) };
}
