import { cookies } from "next/headers";

const CSRF_COOKIE_NAME = "next_pm_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Double-submit CSRF check for mutating Route Handlers reached via the session cookie.
 * Only meaningful for cookie-authenticated requests — Bearer/Basic API-key requests carry
 * no ambient browser credential, so they're exempt (mirrors Redmine's own
 * `protect_from_forgery` skip for API-token-authenticated requests).
 */
export async function verifyCsrf(request: Request): Promise<boolean> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  return Boolean(cookieToken) && cookieToken === headerToken;
}
