// Shared between interface/actions/auth-actions.ts (a "use server" module, which can only
// export async Server Actions — not a plain constant) and the /login/twofa page component.
export const TWOFA_PENDING_COOKIE_NAME = "next_pm_twofa_pending";
export const TWOFA_PENDING_COOKIE_MAX_AGE_SECONDS = 60 * 5;
