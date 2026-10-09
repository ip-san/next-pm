/**
 * The languages the interface is written in. `ja` is the one the interface has always been in, so it is the default
 * until an admin changes it. Redmine's own default is `en`; that difference is recorded in the checklist.
 */
export const LOCALES = ["ja", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ja";

/** The locale for a language code, matched without case, or null when the interface isn't translated to it. */
export function localeFor(code: string | null | undefined): Locale | null {
  if (!code) return null;
  const lowered = code.trim().toLowerCase();
  return (LOCALES as readonly string[]).includes(lowered) ? (lowered as Locale) : null;
}
