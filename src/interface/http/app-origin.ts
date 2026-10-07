import { headers } from "next/headers";

const TRUSTED_LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Resolves the origin (scheme + host) embedded in a mailed link — a background job has no
 * request context of its own by the time it actually sends the mail, so this must be captured
 * at request time instead. The incoming request's Host header is NOT trustworthy for this: a
 * client can send an arbitrary Host, and blindly embedding it would let an attacker poison the
 * link a victim reads in their inbox (classic Host header injection into a security-sensitive
 * email) with a domain the attacker controls, harvesting the token once the victim clicks it.
 * So the Host header is only trusted when it's a loopback address (local dev with no APP_URL
 * configured); anything else requires APP_URL to be set explicitly. Refusing outright rather
 * than falling back to an unvalidated Host keeps a misconfigured production deployment from
 * silently mailing a poisoned link instead of failing loudly.
 *
 * Shared by every mailed link — password reset, self-registration activation and the admin
 * activation request — rather than reimplemented per flow, since one copy getting the rule
 * wrong is the whole risk.
 */
export async function resolveAppOrigin(): Promise<string> {
  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  if (!TRUSTED_LOOPBACK_HOST.test(host)) {
    throw new Error("APP_URL must be set to send account emails from a non-localhost host.");
  }
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
