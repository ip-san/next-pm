import { describe, expect, it } from "bun:test";
import { createSessionToken, verifySessionToken } from "./session-token";
import { createTwofaPendingToken } from "./twofa-pending-token";

// bun test doesn't load .env.local (NODE_ENV=test intentionally skips it, same as most JS
// test runners) — set a fixed secret directly so these tests don't depend on dev env setup.
process.env.JWT_SECRET ??= "test-secret-for-session-token-tests";

describe("session-token / twofa-pending-token purpose isolation", () => {
  it("round-trips a normal session token", async () => {
    const token = await createSessionToken({ userId: "user-1" });
    expect(await verifySessionToken(token)).toEqual({ userId: "user-1" });
  });

  it("REJECTS a pending-2FA token presented as a session token — this is the 2FA bypass this test guards against", async () => {
    const pendingToken = await createTwofaPendingToken({ userId: "user-1", attempts: 0 });
    expect(await verifySessionToken(pendingToken)).toBeNull();
  });

  it("rejects garbage tokens", async () => {
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    // Simulates a token forged without knowledge of JWT_SECRET, or signed under a different one.
    const { SignJWT } = await import("jose");
    const foreignKey = new TextEncoder().encode("a-completely-different-secret");
    const forged = await new SignJWT({ userId: "user-1", purpose: "session" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(foreignKey);
    expect(await verifySessionToken(forged)).toBeNull();
  });
});
