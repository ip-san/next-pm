/**
 * Maps to Redmine's `mail_handler_*` keys in settings.yml. Two defaults deviate from Redmine
 * so that shipping this settings section doesn't change behavior for an existing deployment —
 * the same reasoning as commit-keywords.ts and general-settings.ts:
 *
 * - `mail_handler_api_enabled` defaults to "1", not Redmine's "0". next-pm's mail handler was
 *   previously gated only by the presence of the `MAIL_HANDLER_API_KEY` environment variable,
 *   so defaulting to Redmine's "off" would silently break an already-working inbound pipeline.
 * - `mail_handler_api_key` defaults to empty, and the environment variable stays the fallback
 *   for exactly that reason. An empty key *and* an unset variable still means "disabled",
 *   never "accept anything".
 */
export const MAIL_HANDLER_SETTING_KEYS = [
  "mail_handler_api_enabled",
  "mail_handler_api_key",
  "mail_handler_body_delimiters",
  "mail_handler_enable_regex_delimiters",
  "mail_handler_excluded_filenames",
  "mail_handler_enable_regex_excluded_filenames",
  "mail_handler_preferred_body_part",
] as const;

export type MailHandlerSettingKey = (typeof MAIL_HANDLER_SETTING_KEYS)[number];

export const PREFERRED_BODY_PART_VALUES = ["plain", "html"] as const;
export type PreferredBodyPart = (typeof PREFERRED_BODY_PART_VALUES)[number];

export const MAIL_HANDLER_SETTING_DEFAULTS: Record<MailHandlerSettingKey, string> = {
  mail_handler_api_enabled: "1",
  mail_handler_api_key: "",
  mail_handler_body_delimiters: "",
  mail_handler_enable_regex_delimiters: "0",
  mail_handler_excluded_filenames: "",
  mail_handler_enable_regex_excluded_filenames: "0",
  mail_handler_preferred_body_part: "plain",
};

export interface MailHandlerSettings {
  apiEnabled: boolean;
  /** Empty means "no key configured"; the caller falls back to MAIL_HANDLER_API_KEY. */
  apiKey: string;
  bodyDelimiters: string;
  enableRegexDelimiters: boolean;
  excludedFilenames: string;
  enableRegexExcludedFilenames: boolean;
  preferredBodyPart: PreferredBodyPart;
}

export function resolveMailHandlerSettings(overrides: Record<string, string>): MailHandlerSettings {
  const preferred = overrides.mail_handler_preferred_body_part;
  return {
    apiEnabled: (overrides.mail_handler_api_enabled ?? MAIL_HANDLER_SETTING_DEFAULTS.mail_handler_api_enabled) === "1",
    apiKey: (overrides.mail_handler_api_key ?? "").trim(),
    bodyDelimiters: overrides.mail_handler_body_delimiters ?? "",
    enableRegexDelimiters: overrides.mail_handler_enable_regex_delimiters === "1",
    excludedFilenames: overrides.mail_handler_excluded_filenames ?? "",
    enableRegexExcludedFilenames: overrides.mail_handler_enable_regex_excluded_filenames === "1",
    preferredBodyPart: PREFERRED_BODY_PART_VALUES.includes(preferred as PreferredBodyPart)
      ? (preferred as PreferredBodyPart)
      : "plain",
  };
}

/**
 * Redmine's `MailHandler#accept_attachment?`: a comma-separated list of filename patterns,
 * matched whole against the attachment name, case-insensitively. Without the regex option a
 * pattern is literal except for `*`, which stands for any run of characters.
 */
export function isExcludedAttachmentFilename(filename: string, settings: MailHandlerSettings): boolean {
  const patterns = settings.excludedFilenames
    .split(",")
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0);

  return patterns.some((pattern) => {
    const source = settings.enableRegexExcludedFilenames
      ? pattern
      : pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    try {
      return new RegExp(`^(?:${source})$`, "i").test(filename);
    } catch {
      // An unusable pattern must not silently reject every attachment.
      return false;
    }
  });
}
