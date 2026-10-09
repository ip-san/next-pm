import { DEFAULT_LOCALE, localeFor, type Locale } from "./locales";

export interface LocaleRequest {
  /** The signed-in user's language setting, or null for "default". */
  userLanguage: string | null;
  loggedIn: boolean;
  /** The request's Accept-Language header, or null when there is none. */
  acceptLanguage: string | null;
  settings: {
    defaultLanguage: Locale;
    forceDefaultLanguageForAnonymous: boolean;
    forceDefaultLanguageForLoggedIn: boolean;
  };
}

/**
 * Redmine's ApplicationController#set_localization, in the same order: a signed-in user's language (or the default when
 * the force-for-logged-in setting is on); otherwise the first language of Accept-Language, matched exactly and then by
 * its base language (unless the force-for-anonymous setting is on); otherwise the default language.
 */
export function resolveLocale(request: LocaleRequest): Locale {
  if (request.loggedIn) {
    if (request.settings.forceDefaultLanguageForLoggedIn) return request.settings.defaultLanguage;
    const own = localeFor(request.userLanguage);
    if (own) return own;
  }
  if (!request.settings.forceDefaultLanguageForAnonymous && request.acceptLanguage) {
    const first = firstAcceptedLanguage(request.acceptLanguage);
    if (first) {
      const exact = localeFor(first);
      if (exact) return exact;
      const base = localeFor(first.split("-")[0]);
      if (base) return base;
    }
  }
  return request.settings.defaultLanguage ?? DEFAULT_LOCALE;
}

/** The language tag with the highest quality value in an Accept-Language header (the first one when they tie). */
export function firstAcceptedLanguage(header: string): string | null {
  const entries = header
    .split(",")
    .map((item, index) => {
      const [tag, ...params] = item.trim().split(";");
      const qParam = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      const quality = qParam ? Number(qParam.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((entry) => entry.tag !== "" && entry.tag !== "*" && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  return entries[0]?.tag ?? null;
}
