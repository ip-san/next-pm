export interface TwofaBackupCodeRepository {
  /** Deletes any existing codes for the user and inserts these hashes — used on (re-)pairing. */
  replaceForUser(userId: string, codeHashes: string[]): Promise<void>;
  /** Atomically deletes the matching row if one exists for this user; returns whether it did. */
  consumeIfMatches(userId: string, codeHash: string): Promise<boolean>;
  deleteAllForUser(userId: string): Promise<void>;
}
