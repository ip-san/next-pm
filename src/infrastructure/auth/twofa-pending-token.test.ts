import { describe, expect, it } from "bun:test";
import { createSessionToken } from "./session-token";
import { createTwofaPendingToken, verifyTwofaPendingToken } from "./twofa-pending-token";

// See session-token.test.ts — bun test doesn't load .env.local, so set a fixed secret directly.
process.env.JWT_SECRET ??= "test-secret-for-session-token-tests";

describe("twofa-pending-token", () => {
  it("round-trips userId and attempts", async () => {
    const token = await createTwofaPendingToken({ userId: "user-1", attempts: 2 });
    expect(await verifyTwofaPendingToken(token)).toEqual({ userId: "user-1", attempts: 2 });
  });

  it("rejects a full session token presented as a pending-2FA token", async () => {
    const sessionToken = await createSessionToken({ userId: "user-1" });
    expect(await verifyTwofaPendingToken(sessionToken)).toBeNull();
  });

  it("rejects garbage tokens", async () => {
    expect(await verifyTwofaPendingToken("not-a-jwt")).toBeNull();
  });
});
