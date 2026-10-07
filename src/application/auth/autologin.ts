import type { TwofaMode } from "@/domain/settings/auth-settings";
import { evaluateLoginGate, type LoginGateOutcome } from "@/domain/user/login-gate";
import type { User } from "@/domain/user/entity";
import type { UserRepository } from "@/domain/user/repository";
import { generateToken } from "@/domain/user/token";
import { hashUserToken, isUserTokenExpired } from "@/domain/user-token/entity";
import type { UserTokenRepository } from "@/domain/user-token/repository";

export interface AutologinRepositories {
  userRepository: UserRepository;
  userTokenRepository: UserTokenRepository;
}

/**
 * Mirrors Redmine's User#generate_autologin_token / AccountController#set_autologin_cookie.
 * The row's lifetime is the configured number of days: Redmine passes Setting.autologin to
 * Token.find_active_user as a validity window rather than storing an expiry, which comes to
 * the same thing except that shortening the setting there retroactively kills older cookies.
 * Storing the expiry means an already-issued cookie keeps the duration it was promised; the
 * tradeoff is deliberate and the ceiling is still the setting at issue time.
 *
 * Returns the plaintext value for the caller to put in the cookie — only its hash is stored.
 */
export async function issueAutologinToken(
  repositories: AutologinRepositories,
  userId: string,
  days: number,
): Promise<string> {
  // One remember-me cookie per account, like the single outstanding password-reset link:
  // logging in again from another browser should not leave the previous one usable forever.
  await repositories.userTokenRepository.deleteForUser(userId, "autologin");

  const token = generateToken();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await repositories.userTokenRepository.create(userId, "autologin", hashUserToken(token), expiresAt);
  return token;
}

export type AutologinResult =
  | { ok: true; user: User }
  /** The cookie is unusable and must be cleared — unknown, expired, or the account can't log in. */
  | { ok: false; outcome: LoginGateOutcome | null };

/**
 * Mirrors Redmine's User.try_to_autologin, with one addition Redmine gets for free from its
 * before_action chain: the same login gate the password form uses. A remember-me cookie that
 * skipped it would be a way to keep a locked account — or an account that must present a
 * second factor — logged in indefinitely.
 *
 * Consumes the token on every outcome but a clean success, so a rejected cookie can't be
 * retried and a stale row can't linger.
 */
export async function consumeAutologinToken(
  repositories: AutologinRepositories,
  token: string,
  twofa: TwofaMode,
  now: Date = new Date(),
): Promise<AutologinResult> {
  const stored = await repositories.userTokenRepository.findByTokenHash("autologin", hashUserToken(token));
  if (!stored) {
    return { ok: false, outcome: null };
  }
  if (isUserTokenExpired(stored, now)) {
    await repositories.userTokenRepository.delete(stored.id);
    return { ok: false, outcome: null };
  }

  const user = await repositories.userRepository.findById(stored.userId);
  if (!user) {
    await repositories.userTokenRepository.delete(stored.id);
    return { ok: false, outcome: null };
  }

  const outcome = evaluateLoginGate(user, twofa);
  if (outcome.kind !== "allowed") {
    await repositories.userTokenRepository.delete(stored.id);
    return { ok: false, outcome };
  }

  return { ok: true, user };
}
