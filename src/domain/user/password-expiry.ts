import type { User } from "./entity";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Redmine's User#password_expired?: with password_max_age set, a password set longer ago than that has expired, and
 * one with no recorded change (passwd_changed_on nil) counts as set at the epoch.
 */
export function isPasswordExpired(user: Pick<User, "passwdChangedOn">, maxAgeDays: number, now: Date = new Date()): boolean {
  if (maxAgeDays <= 0) return false;
  const changedOn = user.passwdChangedOn ?? new Date(0);
  return changedOn.getTime() < now.getTime() - maxAgeDays * DAY_MS;
}

/**
 * User#must_change_password?: the account is flagged (must_change_passwd) or the password has expired, and the
 * password is one this app manages (an LDAP account changes it in the directory).
 */
export function mustChangePassword(user: Pick<User, "mustChangePassword" | "passwdChangedOn" | "authSource">, maxAgeDays: number, now: Date = new Date()): boolean {
  if (user.authSource === "ldap") return false;
  return user.mustChangePassword || isPasswordExpired(user, maxAgeDays, now);
}
