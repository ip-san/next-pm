export interface UserSession {
  id: string;
  userId: string;
  createdAt: Date;
  lastActiveAt: Date;
}

export interface SessionExpiryPolicy {
  /** Minutes from login after which the session dies regardless of activity. 0 = unlimited. */
  lifetimeMinutes: number;
  /** Minutes of inactivity after which the session dies. 0 = unlimited. */
  timeoutMinutes: number;
}

/**
 * Mirrors Redmine's Token#expired? for `action = 'session'`, which ApplicationController's
 * session_expired? drives from both Setting.session_lifetime and Setting.session_timeout:
 * the lifetime runs from when the session was created, the timeout from the last request.
 * Either being 0 means "no limit", not "expires immediately".
 */
export function isSessionExpired(session: UserSession, policy: SessionExpiryPolicy, now: Date): boolean {
  if (policy.lifetimeMinutes > 0 && now.getTime() - session.createdAt.getTime() >= policy.lifetimeMinutes * 60_000) {
    return true;
  }
  if (policy.timeoutMinutes > 0 && now.getTime() - session.lastActiveAt.getTime() >= policy.timeoutMinutes * 60_000) {
    return true;
  }
  return false;
}

/**
 * Whether `lastActiveAt` is stale enough to be worth a write. Redmine throttles the equivalent
 * bookkeeping the same way (User#update_last_login_on! skips a write within the last minute),
 * which keeps an idle-timeout session from costing an UPDATE on every single request.
 */
export const SESSION_ACTIVITY_THROTTLE_MS = 60_000;

export function shouldTouchSession(session: UserSession, now: Date): boolean {
  return now.getTime() - session.lastActiveAt.getTime() >= SESSION_ACTIVITY_THROTTLE_MS;
}
