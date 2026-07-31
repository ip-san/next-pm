import { describe, expect, it } from "bun:test";
import { generateSalt, hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a correct password against its hash", () => {
    const salt = generateSalt();
    const hash = hashPassword("correct-horse-battery-staple", salt);
    expect(verifyPassword("correct-horse-battery-staple", salt, hash)).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const salt = generateSalt();
    const hash = hashPassword("correct-horse-battery-staple", salt);
    expect(verifyPassword("wrong-password", salt, hash)).toBe(false);
  });

  it("produces different hashes for different salts", () => {
    const hashA = hashPassword("same-password", generateSalt());
    const hashB = hashPassword("same-password", generateSalt());
    expect(hashA).not.toBe(hashB);
  });
});
