import { headers } from "next/headers";
import type { Locale } from "@/domain/i18n/locales";
import { resolveLocale } from "@/domain/i18n/resolve-locale";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";

/**
 * The language this request's interface is shown in (Redmine's set_localization): the signed-in user's language, the
 * browser's Accept-Language for anonymous visitors, and the default, with the two force-default settings applied.
 */
export async function currentLocale(): Promise<Locale> {
  return localeForViewer(await currentUserFromCookies());
}

/**
 * The same rule for a user the route resolved itself, such as an export or feed reached with an API or Atom key, where
 * the cookie may name nobody or someone else.
 */
export async function localeForViewer(user: { language: string | null } | null): Promise<Locale> {
  const [settings, requestHeaders] = await Promise.all([loadGeneralSettings(new DrizzleSettingsRepository()), headers()]);
  return resolveLocale({
    userLanguage: user?.language ?? null,
    loggedIn: user !== null,
    acceptLanguage: requestHeaders.get("accept-language"),
    settings,
  });
}
