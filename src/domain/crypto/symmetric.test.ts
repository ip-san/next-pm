import { randomBytes } from "node:crypto";
import { describe, expect, it } from "bun:test";
import { decryptSecret, encryptSecret } from "./symmetric";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips plaintext", () => {
    const key = randomBytes(32);
    const encrypted = encryptSecret("JBSWY3DPEHPK3PXP", key);
    expect(decryptSecret(encrypted, key)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const key = randomBytes(32);
    expect(encryptSecret("same-plaintext", key)).not.toBe(encryptSecret("same-plaintext", key));
  });

  it("rejects a key of the wrong length", () => {
    expect(() => encryptSecret("secret", randomBytes(16))).toThrow();
  });

  it("fails closed when decrypting with the wrong key", () => {
    const encrypted = encryptSecret("secret", randomBytes(32));
    expect(() => decryptSecret(encrypted, randomBytes(32))).toThrow();
  });

  it("fails closed when the ciphertext has been tampered with", () => {
    const key = randomBytes(32);
    const encrypted = encryptSecret("secret", key);
    const [iv, authTag, ciphertext] = encrypted.split(":");
    const tamperedByte = Buffer.from(ciphertext, "base64");
    tamperedByte[0] ^= 0xff;
    const tampered = `${iv}:${authTag}:${tamperedByte.toString("base64")}`;
    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  it("rejects a malformed payload", () => {
    expect(() => decryptSecret("not-the-right-shape", randomBytes(32))).toThrow();
  });
});
