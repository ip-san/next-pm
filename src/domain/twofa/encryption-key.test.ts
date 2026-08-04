import { describe, expect, it } from "bun:test";
import { loadTotpEncryptionKeyFromEnv } from "./encryption-key";

const VALID_KEY_HEX = "a".repeat(64);

describe("loadTotpEncryptionKeyFromEnv", () => {
  it("returns null when unset", () => {
    expect(loadTotpEncryptionKeyFromEnv({})).toBeNull();
  });

  it("returns null when blank", () => {
    expect(loadTotpEncryptionKeyFromEnv({ TOTP_ENCRYPTION_KEY: "   " })).toBeNull();
  });

  it("decodes a valid 64-char hex key to a 32-byte buffer", () => {
    const key = loadTotpEncryptionKeyFromEnv({ TOTP_ENCRYPTION_KEY: VALID_KEY_HEX });
    expect(key).not.toBeNull();
    expect(key).toHaveLength(32);
  });

  it("throws on a non-hex value", () => {
    expect(() => loadTotpEncryptionKeyFromEnv({ TOTP_ENCRYPTION_KEY: "not-hex-at-all!!" })).toThrow();
  });

  it("throws on a hex value of the wrong length", () => {
    expect(() => loadTotpEncryptionKeyFromEnv({ TOTP_ENCRYPTION_KEY: "abcd" })).toThrow();
  });
});
