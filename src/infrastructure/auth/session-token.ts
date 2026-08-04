import { jwtVerify, SignJWT } from "jose";
import { jwtSecretKey } from "./jwt-secret";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  userId: string;
}

/**
 * `purpose: "session"` is load-bearing, not decorative: without it, any other HS256 JWT signed
 * with the same JWT_SECRET and a string `userId` claim — e.g. a pending-2FA token minted by
 * twofa-pending-token.ts while a user has only passed their password, not their second factor —
 * would verify here too. Copying that cookie's value into the session cookie in devtools would
 * then be a complete 2FA bypass. verifySessionToken rejects anything without this exact purpose.
 */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload, purpose: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(jwtSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecretKey());
    if (payload.purpose !== "session") return null;
    if (typeof payload.userId !== "string") return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}
