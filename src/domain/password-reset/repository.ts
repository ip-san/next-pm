import type { PasswordResetToken } from "./entity";

export interface PasswordResetTokenRepository {
  create(userId: string, tokenHash: string, expiresAt: Date): Promise<PasswordResetToken>;
  findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>;
  /** Invalidates any outstanding token(s) for a user — at most one active reset link at a time. */
  deleteForUser(userId: string): Promise<void>;
  delete(id: string): Promise<void>;
}
