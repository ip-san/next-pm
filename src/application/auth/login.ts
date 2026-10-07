import { verifyPassword } from "@/domain/user/password";
import { evaluateLoginGate, type LoginGateOutcome } from "@/domain/user/login-gate";
import type { UserRepository } from "@/domain/user/repository";
import type { User } from "@/domain/user/entity";
import type { TwofaMode } from "@/domain/settings/auth-settings";
import type { LdapAuthenticator } from "@/domain/ldap/authenticator";

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
export async function login(
  repositories: LoginRepositories,
  loginName: string,
  clearPassword: string,
  twofa: TwofaMode,
): Promise<LoginResult> {
  const user = await repositories.userRepository.findByLogin(loginName);

  if (user) {
    const authenticated =
      user.authSource === "ldap"
        ? repositories.ldapAuthenticator !== null && (await repositories.ldapAuthenticator.authenticate(loginName, clearPassword)) !== null
        : verifyPassword(clearPassword, user.passwordSalt, user.passwordHash);
    if (!authenticated) {
      return { ok: false, reason: "invalid_credentials" };
    }
    return { ok: true, user, outcome: evaluateLoginGate(user, twofa) };
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
    language: null,
    mailNotification: "all",
    mustChangePassword: false,
    apiKey: null,
    atomKey: null,
    authSource: "ldap",
    twofaScheme: null,
    twofaTotpKey: null,
    twofaTotpLastUsedStep: null,
  });
  // A freshly provisioned LDAP account is active with no second factor, but it still goes
  // through the same gate rather than being waved past it: the twofa setting may require one.
  return { ok: true, user: created, outcome: evaluateLoginGate(created, twofa) };
}
