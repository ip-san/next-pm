import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

export function hashPassword(clearPassword: string, salt: string): string {
  return scryptSync(clearPassword, salt, KEY_LENGTH).toString("hex");
}

export function verifyPassword(clearPassword: string, salt: string, expectedHash: string): boolean {
  const actual = scryptSync(clearPassword, salt, KEY_LENGTH);
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
