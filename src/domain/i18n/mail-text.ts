import { LOCALES, type Locale } from "./locales";

export interface MailText {
  subject: string;
  body: string;
}

/**
 * A mail's subject and body in every interface language. Redmine's Mailer switches to each recipient's own language
 * (falling back to Setting.default_language) before rendering, so the text is built for every language when the mail
 * is queued and the send step picks the one each recipient reads.
 */
export type LocalizedMailText = Record<Locale, MailText>;

/** Builds the text in every language. `subject` and `body` are the Japanese text, for jobs read by an older worker. */
export function localizedMail(build: (locale: Locale) => MailText): MailText & { localized: LocalizedMailText } {
  const localized = Object.fromEntries(LOCALES.map((locale) => [locale, build(locale)])) as LocalizedMailText;
  return { ...localized.ja, localized };
}
