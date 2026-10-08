import { isActiveUser, type User } from "@/domain/user/entity";
import { resolveGeneralSettings } from "@/domain/settings/general-settings";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { resolveSessionUserId } from "./session";

/** Only an active account resolves — see the note on activeOrNull. */
function activeOrNull(user: User | null): User | null {
  return user && isActiveUser(user) ? user : null;
}

/**
 * Resolves the current user for Server Components / Server Actions from the session cookie.
 *
 * Two independent gates, and both are load-bearing:
 *
 * - `resolveSessionUserId` (session.ts) owns the cookie: signature, the backing user_sessions
 *   row, session_lifetime and the idle session_timeout. Without it those settings have
 *   nothing to act on, because a stateless JWT cannot carry a server-owned idle clock.
 * - `activeOrNull` re-reads the status on every request, mirroring Redmine's
 *   `User.active.find(session[:user_id])` in ApplicationController#find_current_user. Without
 *   it, locking an account is cosmetic: the JWT keeps working until it expires.
 */
export async function currentUserFromCookies(): Promise<User | null> {
  const userId = await resolveSessionUserId();
  if (!userId) return null;

  return activeOrNull(await new DrizzleUserRepository().findById(userId));
}

/**
 * Resolves the current user for REST API Route Handlers, mirroring Redmine's own
 * ApplicationController#api_key_from_request / user_setup precedence:
 *   1. `Authorization: Bearer <api_key>` (sheet row: Bearerトークン)
 *   2. HTTP Basic with the API key as the *username* (password is ignored) — this is
 *      Redmine's actual convention (`User.find_by_api_key(username)`), not the key-as-password
 *      shape one might guess (sheet row: BASIC認証)
 */
export async function currentUserFromAuthorizationHeader(request: Request): Promise<User | null> {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const { restApiEnabled } = resolveGeneralSettings(await new DrizzleSettingsRepository().getAll());
  if (!restApiEnabled) return null;

  const userRepository = new DrizzleUserRepository();

  // Redmine resolves an API key through Token.find_active_user, so a locked account's key
  // stops working the moment it is locked — same rule as the session path above.
  const bearerMatch = header.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return activeOrNull(await userRepository.findByApiKey(bearerMatch[1]));
  }

  const basicMatch = header.match(/^Basic\s+(.+)$/i);
  if (basicMatch) {
    const decoded = Buffer.from(basicMatch[1], "base64").toString("utf-8");
    const separatorIndex = decoded.indexOf(":");
    const apiKey = separatorIndex === -1 ? decoded : decoded.slice(0, separatorIndex);
    return activeOrNull(await userRepository.findByApiKey(apiKey));
  }

  return null;
}
