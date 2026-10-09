import { verifyPassword } from "@/domain/user/password";
import type { UserRepository } from "@/domain/user/repository";
import { ldapSourceForUser, type LdapSource } from "@/domain/ldap/authenticator";

export interface VerifyCurrentPasswordRepositories {
  userRepository: UserRepository;
  ldapSources: LdapSource[];
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
    // Checked against the source that created the account, as login() does.
    const createdBy = ldapSourceForUser(repositories.ldapSources, user.ldapAuthSourceId);
    if (!createdBy) return false;
    return (await createdBy.authenticator.authenticate(user.login, clearPassword)) !== null;
  }
  return verifyPassword(clearPassword, user.passwordSalt, user.passwordHash);
}
