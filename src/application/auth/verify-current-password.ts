import { verifyPassword } from "@/domain/user/password";
import type { UserRepository } from "@/domain/user/repository";
import type { LdapAuthenticator } from "@/domain/ldap/authenticator";

export interface VerifyCurrentPasswordRepositories {
  userRepository: UserRepository;
  ldapAuthenticator: LdapAuthenticator | null;
}

/**
 * Re-checks a user's own current credential — used to gate disabling 2FA, a scoped-down stand-in
 * for Redmine's broader sudo-mode re-authentication (lib/redmine/sudo_mode.rb), which this app
 * doesn't otherwise implement. Delegates to LDAP for an authSource === "ldap" user, exactly like
 * login()'s branching, since such a user's local passwordHash is an empty string by construction.
 */
export async function verifyCurrentPassword(
  repositories: VerifyCurrentPasswordRepositories,
  userId: string,
  clearPassword: string,
): Promise<boolean> {
  const user = await repositories.userRepository.findById(userId);
  if (!user) return false;

  if (user.authSource === "ldap") {
    if (!repositories.ldapAuthenticator) return false;
    return (await repositories.ldapAuthenticator.authenticate(user.login, clearPassword)) !== null;
  }
  return verifyPassword(clearPassword, user.passwordSalt, user.passwordHash);
}
