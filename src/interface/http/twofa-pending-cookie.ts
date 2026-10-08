import { cookies } from "next/headers";
import { createTwofaPendingToken } from "@/infrastructure/auth/twofa-pending-token";

// Shared between interface/actions/auth-actions.ts (a "use server" module, which can only
// export async Server Actions — not a plain constant) and the /login/twofa page component.
export const TWOFA_PENDING_COOKIE_NAME = "next_pm_twofa_pending";
export const TWOFA_PENDING_COOKIE_MAX_AGE_SECONDS = 60 * 5;

/**
 * Hands out the short-lived cookie that stands between a correct password and a session.
 *
 * One definition, used by every path that defers a login to a second factor — the password
 * form, the "too many tries" renewal and automatic self-registration — because the alternative
 * is three copies of the cookie flags, and a copy that forgets httpOnly or the TTL is a copy
 * that turns the pending state into something closer to a session.
 *
 * `rememberMe` rides along because the choice was made on the password form and has to survive
 * the round trip; Redmine stashes it as session[:twofa_autologin] for the same reason.
 */
export async function startPendingTwofaSetup(userId: string, rememberMe = false, attempts = 0): Promise<void> {
  const token = await createTwofaPendingToken({ userId, attempts, rememberMe });
  const cookieStore = await cookies();
  cookieStore.set(TWOFA_PENDING_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TWOFA_PENDING_COOKIE_MAX_AGE_SECONDS,
  });
}
