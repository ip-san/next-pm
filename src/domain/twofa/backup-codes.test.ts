import { describe, expect, it } from "bun:test";
import { generateBackupCodes, hashBackupCode } from "./backup-codes";

describe("generateBackupCodes", () => {
  it("generates 10 codes by default", () => {
    expect(generateBackupCodes()).toHaveLength(10);
  });

  it("generates the requested count", () => {
    expect(generateBackupCodes(3)).toHaveLength(3);
  });

  it("produces 12-character lowercase hex strings", () => {
    for (const code of generateBackupCodes(20)) {
      expect(code).toMatch(/^[0-9a-f]{12}$/);
    }
  });

  it("does not repeat codes within a batch", () => {
    const codes = generateBackupCodes(50);
    expect(new Set(codes).size).toBe(50);
  });
});

describe("hashBackupCode", () => {
  it("is deterministic for the same input", () => {
    expect(hashBackupCode("abcd1234ef56")).toBe(hashBackupCode("abcd1234ef56"));
  });

  it("produces different hashes for different codes", () => {
    expect(hashBackupCode("abcd1234ef56")).not.toBe(hashBackupCode("000000000000"));
  });

  it("normalizes case and surrounding whitespace before hashing", () => {
    const canonical = hashBackupCode("abcd1234ef56");
    expect(hashBackupCode("ABCD1234EF56")).toBe(canonical);
    expect(hashBackupCode("  abcd1234ef56  ")).toBe(canonical);
  });

  it("returns a 64-character hex sha256 digest", () => {
    expect(hashBackupCode("abcd1234ef56")).toMatch(/^[0-9a-f]{64}$/);
  });
});
