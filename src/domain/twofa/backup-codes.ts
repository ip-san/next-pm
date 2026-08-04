import { createHash, randomBytes } from "node:crypto";

/**
 * Mirrors Redmine's Redmine::Utils.random_hex(6) for backup-code values (12 lowercase hex
 * chars), generated 10 at a time (lib/redmine/twofa/base.rb#init_backup_codes!). Unlike
 * Redmine, callers here should store hashBackupCode(code) rather than the plaintext — Redmine
 * keeps these in a plaintext `tokens.value` column, which is a real gap worth not repeating now
 * that there's no shared multi-purpose token table forcing that shape.
 */
export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => randomBytes(6).toString("hex"));
}

/** Case/whitespace-normalized before hashing, matching Redmine's comparison (downcase, strip whitespace). */
export function hashBackupCode(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}
