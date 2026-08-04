import { describe, expect, it } from "bun:test";
import { base32Decode, base32Encode, computeTotp, generateTotpSecret, provisioningUri, verifyTotp } from "./totp";

// RFC 6238 Appendix B test vectors (SHA1 mode): 20-byte ASCII secret "12345678901234567890",
// 8-digit output, 30s step, T0=0. These are the correctness evidence for computeHotp/computeTotp
// — see the doc comment in totp.ts for why this stands in for Redmine-source comparison here.
const RFC_6238_SECRET_BASE32 = base32Encode(Buffer.from("12345678901234567890", "ascii"));
const RFC_6238_VECTORS: Array<[number, string]> = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
];

describe("base32Encode / base32Decode", () => {
  it("round-trips arbitrary bytes", () => {
    const original = Buffer.from([0, 1, 2, 253, 254, 255, 42, 17]);
    expect(base32Decode(base32Encode(original))).toEqual(original);
  });

  it("decodes the RFC 6238 secret to the expected ASCII bytes", () => {
    expect(base32Decode(RFC_6238_SECRET_BASE32).toString("ascii")).toBe("12345678901234567890");
  });

  it("is case-insensitive and tolerates padding on decode", () => {
    const encoded = base32Encode(Buffer.from("hello"));
    expect(base32Decode(encoded.toLowerCase())).toEqual(Buffer.from("hello"));
    expect(base32Decode(`${encoded}===`)).toEqual(Buffer.from("hello"));
  });

  it("rejects invalid base32 characters", () => {
    expect(() => base32Decode("this is not base32!")).toThrow();
  });
});

describe("computeTotp — RFC 6238 Appendix B vectors", () => {
  for (const [unixSeconds, expected] of RFC_6238_VECTORS) {
    it(`produces ${expected} at T=${unixSeconds}`, () => {
      expect(computeTotp(RFC_6238_SECRET_BASE32, unixSeconds, { digits: 8 })).toBe(expected);
    });
  }
});

describe("verifyTotp", () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000;
  const currentStep = Math.floor(now / 30);

  it("accepts the current step's code", () => {
    const code = computeTotp(secret, now);
    expect(verifyTotp(secret, code, { now, lastUsedStep: null })).toEqual({ verified: true, step: currentStep });
  });

  it("accepts a code from exactly one step behind (default drift)", () => {
    const code = computeTotp(secret, now - 30);
    expect(verifyTotp(secret, code, { now, lastUsedStep: null })).toEqual({
      verified: true,
      step: currentStep - 1,
    });
  });

  it("rejects a code from two steps behind — past the allowed drift", () => {
    const code = computeTotp(secret, now - 60);
    expect(verifyTotp(secret, code, { now, lastUsedStep: null }).verified).toBe(false);
  });

  it("rejects a code from one step ahead — drift is behind-only", () => {
    const code = computeTotp(secret, now + 30);
    expect(verifyTotp(secret, code, { now, lastUsedStep: null }).verified).toBe(false);
  });

  it("rejects a code whose step is at or before lastUsedStep (anti-replay)", () => {
    const code = computeTotp(secret, now);
    expect(verifyTotp(secret, code, { now, lastUsedStep: currentStep }).verified).toBe(false);
  });

  it("rejects a code once its own step becomes the anti-replay floor", () => {
    const code = computeTotp(secret, now - 30);
    expect(verifyTotp(secret, code, { now, lastUsedStep: currentStep - 1 }).verified).toBe(false);
  });

  it("accepts a step after lastUsedStep even if an earlier step in the drift window was already used", () => {
    const code = computeTotp(secret, now);
    expect(verifyTotp(secret, code, { now, lastUsedStep: currentStep - 2 })).toEqual({
      verified: true,
      step: currentStep,
    });
  });

  it("rejects a wrong code", () => {
    expect(verifyTotp(secret, "000000", { now, lastUsedStep: null }).verified).toBe(false);
  });
});

describe("generateTotpSecret", () => {
  it("produces a decodable base32 string of the expected length for 160 bits", () => {
    const secret = generateTotpSecret();
    expect(base32Decode(secret)).toHaveLength(20);
  });

  it("produces distinct secrets across calls", () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });
});

describe("provisioningUri", () => {
  it("builds an otpauth:// URI with issuer, account, and standard parameters", () => {
    const uri = provisioningUri("JBSWY3DPEHPK3PXP", "alice", "next-pm");
    expect(uri).toStartWith("otpauth://totp/next-pm:alice?");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=next-pm");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });

  it("percent-encodes issuer/account names containing reserved characters", () => {
    const uri = provisioningUri("SECRET", "alice bob", "next pm: prod");
    expect(uri).toStartWith("otpauth://totp/next%20pm%3A%20prod:alice%20bob?");
  });
});
