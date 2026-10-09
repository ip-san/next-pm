import { describe, expect, it } from "bun:test";
import { firstAcceptedLanguage, resolveLocale, type LocaleRequest } from "./resolve-locale";

const base: LocaleRequest = {
  userLanguage: null,
  loggedIn: false,
  acceptLanguage: null,
  settings: { defaultLanguage: "ja", forceDefaultLanguageForAnonymous: false, forceDefaultLanguageForLoggedIn: false },
};

describe("resolveLocale", () => {
  it("uses a signed-in user's language", () => {
    expect(resolveLocale({ ...base, loggedIn: true, userLanguage: "en" })).toBe("en");
  });

  it("uses the default for a signed-in user with the force-for-logged-in setting, whatever their language", () => {
    const settings = { ...base.settings, forceDefaultLanguageForLoggedIn: true };
    expect(resolveLocale({ ...base, loggedIn: true, userLanguage: "en", settings })).toBe("ja");
  });

  it("falls back to Accept-Language for an anonymous visitor", () => {
    expect(resolveLocale({ ...base, acceptLanguage: "en-US,fr;q=0.8" })).toBe("en");
  });

  it("ignores Accept-Language when the force-for-anonymous setting is on", () => {
    const settings = { ...base.settings, forceDefaultLanguageForAnonymous: true };
    expect(resolveLocale({ ...base, acceptLanguage: "en", settings })).toBe("ja");
  });

  it("uses the default when the first accepted language isn't translated, rather than the second", () => {
    expect(resolveLocale({ ...base, acceptLanguage: "fr,en;q=0.5" })).toBe("ja");
  });

  it("uses a signed-in user's own language before Accept-Language", () => {
    expect(resolveLocale({ ...base, loggedIn: true, userLanguage: "ja", acceptLanguage: "en" })).toBe("ja");
  });

  it("falls back to Accept-Language for a signed-in user who has no language set", () => {
    expect(resolveLocale({ ...base, loggedIn: true, userLanguage: null, acceptLanguage: "en" })).toBe("en");
  });

  it("uses the configured default when nothing else applies", () => {
    expect(resolveLocale({ ...base, settings: { ...base.settings, defaultLanguage: "en" } })).toBe("en");
  });
});

describe("firstAcceptedLanguage", () => {
  it("picks the highest quality, then the earliest", () => {
    expect(firstAcceptedLanguage("fr;q=0.5, en;q=0.9, ja;q=0.9")).toBe("en");
  });

  it("ignores entries with a zero quality and the wildcard", () => {
    expect(firstAcceptedLanguage("en;q=0, *, ja")).toBe("ja");
  });
});
