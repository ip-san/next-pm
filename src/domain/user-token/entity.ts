import { createHash } from "node:crypto";

/** Redmine's `tokens.action` values next-pm needs; `recovery` predates this (password_reset_tokens). */
export const USER_TOKEN_ACTIONS = ["autologin", "register"] as const;
export type UserTokenAction = (typeof USER_TOKEN_ACTIONS)[number];

export interface UserToken {
  id: string;
  userId: string;
  action: UserTokenAction;
  /** sha256 hex digest of the value handed out — never the value itself. */
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

/** Same construction as hashResetToken in application/auth/request-password-reset.ts. */
export function hashUserToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mirrors Redmine's Token::ACTIVATION_VALIDITY (1 day) for `action = 'register'`. */
export const ACTIVATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function isUserTokenExpired(token: UserToken, now: Date): boolean {
  return token.expiresAt.getTime() <= now.getTime();
}
