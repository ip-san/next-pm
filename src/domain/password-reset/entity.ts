export interface PasswordResetToken {
  id: string;
  userId: string;
  /** sha256 hex digest of the raw token mailed to the user — never stored in plaintext. */
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}
