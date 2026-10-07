import { NextResponse, type NextRequest } from "next/server";
import { activateAccount } from "@/application/accounts/register-account";
import { loadAuthSettings } from "@/application/settings/auth-settings";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleUserTokenRepository } from "@/infrastructure/db/repositories/user-token-repository";

/**
 * Mirrors AccountController#activate: a GET from the mailed link, with every failure mode
 * collapsing to the same redirect so the endpoint cannot be used to probe which tokens exist.
 *
 * Deliberately does NOT log the user in. Redmine's activate ends at `redirect_to signin_path`
 * too — the account is usable, but the link in an inbox is not itself proof of possession of
 * the password.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  }

  const settings = await loadAuthSettings(new DrizzleSettingsRepository());
  const result = await activateAccount(
    { userRepository: new DrizzleUserRepository(), userTokenRepository: new DrizzleUserTokenRepository() },
    token,
    settings,
  );

  return NextResponse.redirect(
    new URL(result.ok ? "/login?activated=1" : "/login?error=activation_failed", request.nextUrl.origin),
  );
}
