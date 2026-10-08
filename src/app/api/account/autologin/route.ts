import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { consumeAutologinToken } from "@/application/auth/autologin";
import { loadAuthSettings } from "@/application/settings/auth-settings";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleUserTokenRepository } from "@/infrastructure/db/repositories/user-token-repository";
import { safeBackPath } from "@/domain/user/back-url";
import { AUTOLOGIN_COOKIE_NAME, establishSession } from "@/interface/http/session";

/**
 * Redeems a remember-me cookie, mirroring Redmine's User.try_to_autologin (which runs inside
 * ApplicationController#user_setup, on any request).
 *
 * It is a Route Handler rather than part of the resolver because only a Route Handler or a
 * Server Action may set a cookie, and redeeming the token has to mint a session. proxy.ts
 * spots "no session cookie but a remember-me cookie" and sends the request here with the
 * original path in `back`, so this works for a deep link, not only for the home page.
 */

export async function GET(request: NextRequest): Promise<Response> {
  const back = safeBackPath(request.nextUrl.searchParams.get("back"));
  const target = new URL(back, request.nextUrl.origin);
  // Belt and braces: safeBackPath already rejects everything that could leave the origin, but
  // this is a redirect built from a query parameter, so the resolved origin is checked too.
  const redirectResponse = NextResponse.redirect(
    target.origin === request.nextUrl.origin ? target : new URL("/", request.nextUrl.origin),
  );

  const cookieStore = await cookies();
  const token = cookieStore.get(AUTOLOGIN_COOKIE_NAME)?.value;
  if (!token) {
    return redirectResponse;
  }

  const { autologinDays, twofa } = await loadAuthSettings(new DrizzleSettingsRepository());
  if (autologinDays === 0) {
    // An admin turned remember-me off after this cookie was issued; honour that immediately.
    redirectResponse.cookies.delete(AUTOLOGIN_COOKIE_NAME);
    return redirectResponse;
  }

  const result = await consumeAutologinToken(
    { userRepository: new DrizzleUserRepository(), userTokenRepository: new DrizzleUserTokenRepository() },
    token,
    twofa,
  );
  if (!result.ok) {
    // Always drop the cookie on a refusal — otherwise proxy.ts would send every subsequent
    // request straight back here and the user would never reach a page.
    redirectResponse.cookies.delete(AUTOLOGIN_COOKIE_NAME);
    return redirectResponse;
  }

  await establishSession(result.user.id);
  return redirectResponse;
}
