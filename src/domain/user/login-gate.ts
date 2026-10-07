import type { TwofaMode } from "@/domain/settings/auth-settings";
import { isActiveUser, isTwofaActive, type User } from "./entity";

/**
 * Mirrors Redmine's User#must_activate_twofa?. Redmine also returns true when the user belongs
 * to a group with `twofa_required`; next-pm's groups table has no such column, so that clause
 * has no counterpart here — the two global modes ('2' everyone, '3' administrators) are the
 * whole rule.
 */
export function mustActivateTwofa(user: Pick<User, "isAdmin" | "twofaScheme">, twofa: TwofaMode): boolean {
  if (isTwofaActive(user)) {
    return false;
  }
  return twofa === "2" || (twofa === "3" && user.isAdmin);
}

/** Redmine's account_pending / account_locked flash messages. */
export const INACTIVE_ACCOUNT_MESSAGE: Record<User["status"], string> = {
  registered: "アカウントはまだ有効化されていません。",
  locked: "アカウントはロックされています。",
  active: "このアカウントではログインできません。",
};

export type LoginGateOutcome =
  | { kind: "allowed" }
  /** Password accepted, but the account is not usable yet — Redmine's handle_inactive_user. */
  | { kind: "inactive"; status: User["status"] }
  /** A confirmed second factor exists and must be presented — Redmine's twofa_active? branch. */
  | { kind: "twofa_required" }
  /** The twofa setting demands a second factor this account has never paired. */
  | { kind: "twofa_setup_required" };

/**
 * The one gate every path that is about to hand out a session must pass through: password
 * login, LDAP login, the remember-me cookie, the activation link and the second-factor form
 * alike. Keeping it a single pure function (rather than a check repeated per entry point) is
 * the point — Redmine's own `handle_active_user` / `handle_inactive_user` split is what keeps
 * its paths from drifting, and a gate enforced on one path but not its sibling is exactly how
 * a locked account keeps working through a remember-me cookie.
 *
 * `skipTwofa` is for the paths that have *just* satisfied the second factor, so they don't
 * loop back into it; everything else leaves it false.
 */
export function evaluateLoginGate(
  user: Pick<User, "status" | "isAdmin" | "twofaScheme">,
  twofa: TwofaMode,
  options: { skipTwofa?: boolean } = {},
): LoginGateOutcome {
  if (!isActiveUser(user)) {
    return { kind: "inactive", status: user.status };
  }
  if (options.skipTwofa) {
    return { kind: "allowed" };
  }
  // Mode '0' disables the feature outright (Setting.twofa?), so an already-paired user is not
  // challenged — same as Redmine, where require_active_twofa denies the whole 2FA controller.
  if (twofa !== "0" && isTwofaActive(user)) {
    return { kind: "twofa_required" };
  }
  if (mustActivateTwofa(user, twofa)) {
    return { kind: "twofa_setup_required" };
  }
  return { kind: "allowed" };
}
