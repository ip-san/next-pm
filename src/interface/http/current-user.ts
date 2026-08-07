import { cookies } from "next/headers";
import type { User } from "@/domain/user/entity";
import { resolveGeneralSettings } from "@/domain/settings/general-settings";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { verifySessionToken } from "@/infrastructure/auth/session-token";

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "next_pm_session";

/** Resolves the current user for Server Components / Server Actions from the session cookie. */
export async function currentUserFromCookies(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  return new DrizzleUserRepository().findById(payload.userId);
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

  const bearerMatch = header.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return userRepository.findByApiKey(bearerMatch[1]);
  }

  const basicMatch = header.match(/^Basic\s+(.+)$/i);
  if (basicMatch) {
    const decoded = Buffer.from(basicMatch[1], "base64").toString("utf-8");
    const separatorIndex = decoded.indexOf(":");
    const apiKey = separatorIndex === -1 ? decoded : decoded.slice(0, separatorIndex);
    return userRepository.findByApiKey(apiKey);
  }

  return null;
}
