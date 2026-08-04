import { jwtVerify, SignJWT } from "jose";
import { jwtSecretKey } from "./jwt-secret";

// Short-lived: this token exists only for the gap between a successful password check and a
// successful second factor. Mirrors Redmine's ~2-minute twofa_session token window (see
// account_controller.rb) loosely rounded up for usability; unlike Redmine's DB-backed Token
// row, this is a stateless signed JWT, consistent with how next-pm already does sessions.
const TWOFA_PENDING_TTL_SECONDS = 60 * 5;
export const TWOFA_MAX_ATTEMPTS = 3;

export interface TwofaPendingPayload {
  userId: string;
  /** Verification attempts made so far against this pending login. */
  attempts: number;
}

/** `purpose: "twofa_pending"` — never accepted by verifySessionToken; see its doc comment. */
export async function createTwofaPendingToken(payload: TwofaPendingPayload): Promise<string> {
  return new SignJWT({ ...payload, purpose: "twofa_pending" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TWOFA_PENDING_TTL_SECONDS}s`)
    .sign(jwtSecretKey());
}

export async function verifyTwofaPendingToken(token: string): Promise<TwofaPendingPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecretKey());
    if (payload.purpose !== "twofa_pending") return null;
    if (typeof payload.userId !== "string") return null;
    if (typeof payload.attempts !== "number") return null;
    return { userId: payload.userId, attempts: payload.attempts };
  } catch {
    return null;
  }
}
