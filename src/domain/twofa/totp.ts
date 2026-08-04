import { createHmac, randomBytes } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32, no padding — the conventional form for otpauth:// secret parameters. */
export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

/** Accepts padded or unpadded, upper- or lowercase input. Throws on any non-alphabet character. */
export function base32Decode(input: string): Buffer {
  const cleaned = input.trim().toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`invalid base32 character: ${char}`);
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A fresh random secret for a new pairing attempt — 160 bits, base32-encoded. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/**
 * RFC 4226 HOTP: HMAC-SHA1 over the 8-byte big-endian counter, dynamic truncation, mod 10^digits.
 * Verified against RFC 6238 Appendix B's test vectors (see totp.test.ts) — that reproduction is
 * the correctness evidence here, not a comparison against Redmine's Ruby source: the `rotp` gem
 * Redmine delegates to isn't vendored in this checkout, so its exact default digest/digit/step
 * parameters couldn't be read from source. SHA1/6-digits/30s match the RFC 6238 defaults and
 * everything observable in Redmine's own code (it never overrides them), but treat that as
 * "matches the standard's defaults," not "independently confirmed identical to Redmine."
 */
export function computeHotp(secret: Buffer, counter: number, digits = 6): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = binCode % 10 ** digits;
  return otp.toString().padStart(digits, "0");
}

export interface TotpOptions {
  digits?: number;
  stepSeconds?: number;
}

export function computeTotp(secretBase32: string, unixSeconds: number, options: TotpOptions = {}): string {
  const stepSeconds = options.stepSeconds ?? 30;
  const step = Math.floor(unixSeconds / stepSeconds);
  return computeHotp(base32Decode(secretBase32), step, options.digits ?? 6);
}

export interface VerifyTotpOptions extends TotpOptions {
  /** Unix seconds to verify against. */
  now: number;
  /** Time steps of clock drift to tolerate behind `now`. Mirrors Redmine's 30-second allowance
   * (one step at the default 30s period) — note this is in STEPS, not seconds. Codes ahead of
   * `now` are never accepted, matching Redmine (which passes drift_behind but not drift_ahead). */
  driftBehindSteps?: number;
  /** The step number of the last code this secret successfully verified, or null if never used.
   * Anti-replay floor: a step at or before this is rejected even if the code matches, mirroring
   * twofa_totp_last_used_at / ROTP's `after:` parameter. */
  lastUsedStep: number | null;
}

export interface VerifyTotpResult {
  verified: boolean;
  /** The step number that matched, to persist as the new anti-replay floor. Null on failure. */
  step: number | null;
}

export function verifyTotp(secretBase32: string, code: string, options: VerifyTotpOptions): VerifyTotpResult {
  const stepSeconds = options.stepSeconds ?? 30;
  const digits = options.digits ?? 6;
  const driftBehindSteps = options.driftBehindSteps ?? 1;
  const currentStep = Math.floor(options.now / stepSeconds);
  const secret = base32Decode(secretBase32);

  for (let step = currentStep; step >= currentStep - driftBehindSteps; step--) {
    if (options.lastUsedStep !== null && step <= options.lastUsedStep) {
      continue;
    }
    if (computeHotp(secret, step, digits) === code) {
      return { verified: true, step };
    }
  }
  return { verified: false, step: null };
}

/** otpauth://totp/ISSUER:ACCOUNT?secret=...&issuer=...&algorithm=SHA1&digits=6&period=30 */
export function provisioningUri(secretBase32: string, accountName: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
