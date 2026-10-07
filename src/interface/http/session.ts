import { cookies } from "next/headers";
import type { User } from "@/domain/user/entity";
import { isSessionExpired, shouldTouchSession } from "@/domain/user-session/entity";
import { resolveAuthSettings } from "@/domain/settings/auth-settings";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleUserSessionRepository } from "@/infrastructure/db/repositories/user-session-repository";
import { DrizzleUserTokenRepository } from "@/infrastructure/db/repositories/user-token-repository";
import { createSessionToken, verifySessionToken } from "@/infrastructure/auth/session-token";
import { issueAutologinToken } from "@/application/auth/autologin";
import { TWOFA_PENDING_COOKIE_NAME } from "./twofa-pending-cookie";

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "next_pm_session";
export const AUTOLOGIN_COOKIE_NAME = "next_pm_autologin";

/** Upper bound on the cookie itself; the user_sessions row is what session_lifetime/timeout act on. */
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/**
 * The single place a session cookie is handed out. Every authenticated entry point — password
 * login, the second-factor form, forced 2FA setup, the remember-me cookie, activation with
 * automatic registration — routes through here, so none of them can quietly skip creating the
 * server-side row that session_lifetime/session_timeout and "log out everywhere" depend on.
 *
 * `rememberMe` mirrors Redmine's `params[:autologin] && Setting.autologin?`: the checkbox alone
 * is not enough, the setting has to allow it too.
 */
export async function establishSession(userId: string, options: { rememberMe?: boolean } = {}): Promise<void> {
  const session = await new DrizzleUserSessionRepository().create(userId);
  const token = await createSessionToken({ userId, sessionId: session.id });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, cookieOptions(SESSION_COOKIE_MAX_AGE_SECONDS));
  cookieStore.delete(TWOFA_PENDING_COOKIE_NAME);

  const { autologinDays } = resolveAuthSettings(await new DrizzleSettingsRepository().getAll());
  if (options.rememberMe && autologinDays > 0) {
    const autologinToken = await issueAutologinToken(
      { userRepository: new DrizzleUserRepository(), userTokenRepository: new DrizzleUserTokenRepository() },
      userId,
      autologinDays,
    );
    cookieStore.set(AUTOLOGIN_COOKIE_NAME, autologinToken, cookieOptions(autologinDays * 24 * 60 * 60));
  }
}

/** Drops the current session row (so it can't be resumed) along with every auth cookie. */
export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const payload = token ? await verifySessionToken(token) : null;
  if (payload) {
    await new DrizzleUserSessionRepository().delete(payload.sessionId);
    // Redmine's logout_user also drops the autologin token, not only the cookie — otherwise a
    // copy of the cookie value taken earlier would still log the account back in.
    await new DrizzleUserTokenRepository().deleteForUser(payload.userId, "autologin");
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete(AUTOLOGIN_COOKIE_NAME);
  cookieStore.delete(TWOFA_PENDING_COOKIE_NAME);
}

/**
 * Resolves the session cookie into its backing row, applying session_lifetime/session_timeout
 * and bumping the idle clock. Returns null (meaning "not logged in") for an expired or deleted
 * session; the stale cookie itself is cleaned up on the next write path, since a Server
 * Component may not modify cookies.
 */
export async function resolveSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const sessionRepository = new DrizzleUserSessionRepository();
  const session = await sessionRepository.findById(payload.sessionId);
  if (!session || session.userId !== payload.userId) return null;

  const { sessionLifetimeMinutes, sessionTimeoutMinutes } = resolveAuthSettings(
    await new DrizzleSettingsRepository().getAll(),
  );
  const now = new Date();
  if (isSessionExpired(session, { lifetimeMinutes: sessionLifetimeMinutes, timeoutMinutes: sessionTimeoutMinutes }, now)) {
    await sessionRepository.delete(session.id);
    return null;
  }
  if (shouldTouchSession(session, now)) {
    await sessionRepository.touch(session.id, now);
  }

  return payload.userId;
}

/**
 * Invalidates every session and remember-me cookie a user holds — Redmine's
 * User#destroy_tokens, which fires on a password change, a status change away from active and
 * a 2FA activation. Callers that are themselves the acting user re-establish their own session
 * afterwards, exactly as MyController#password does with `session[:tk]`.
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  await new DrizzleUserSessionRepository().deleteForUser(userId);
  await new DrizzleUserTokenRepository().deleteForUser(userId, "autologin");
}

/** Narrow helper for pages that only need the user object. */
export async function sessionUser(): Promise<User | null> {
  const userId = await resolveSessionUserId();
  return userId ? new DrizzleUserRepository().findById(userId) : null;
}
