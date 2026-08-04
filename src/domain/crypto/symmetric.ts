import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
export const SYMMETRIC_KEY_LENGTH = 32;

/** `iv:authTag:ciphertext`, each base64 — AES-256-GCM authenticated encryption. */
export function encryptSecret(plaintext: string, key: Buffer): string {
  if (key.length !== SYMMETRIC_KEY_LENGTH) {
    throw new Error(`encryption key must be ${SYMMETRIC_KEY_LENGTH} bytes, got ${key.length}`);
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/** Throws on a tampered/truncated payload or wrong key — GCM's tag check fails closed. */
export function decryptSecret(encoded: string, key: Buffer): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) {
    throw new Error("malformed encrypted payload");
  }
  const [ivPart, authTagPart, ciphertextPart] = parts;
  const iv = Buffer.from(ivPart, "base64");
  const authTag = Buffer.from(authTagPart, "base64");
  const ciphertext = Buffer.from(ciphertextPart, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
