/**
 * Maps to two of Redmine's settings.yml keys that next-pm previously hardcoded rather than
 * exposed: `attachment_max_size` (Attachments tab, stored in KB) and `rest_api_enabled` (API
 * tab). Both defaults below preserve next-pm's prior hardcoded behavior exactly, so shipping
 * this settings page doesn't silently change anything for existing deployments until an admin
 * explicitly changes a value — same reasoning as commit-keywords.ts's defaults.
 */
export const GENERAL_SETTING_KEYS = ["attachment_max_size", "rest_api_enabled"] as const;

export type GeneralSettingKey = (typeof GENERAL_SETTING_KEYS)[number];

const PRIOR_HARDCODED_MAX_SIZE_BYTES = 25 * 1024 * 1024;

export const GENERAL_SETTING_DEFAULTS: Record<GeneralSettingKey, string> = {
  attachment_max_size: String(PRIOR_HARDCODED_MAX_SIZE_BYTES / 1024),
  rest_api_enabled: "1",
};

export interface GeneralSettings {
  attachmentMaxSizeBytes: number;
  restApiEnabled: boolean;
}

export function resolveGeneralSettings(overrides: Record<string, string>): GeneralSettings {
  const maxSizeKb = Number(overrides.attachment_max_size ?? GENERAL_SETTING_DEFAULTS.attachment_max_size);
  const restApiEnabledRaw = overrides.rest_api_enabled ?? GENERAL_SETTING_DEFAULTS.rest_api_enabled;

  return {
    attachmentMaxSizeBytes: (Number.isFinite(maxSizeKb) && maxSizeKb > 0 ? maxSizeKb : PRIOR_HARDCODED_MAX_SIZE_BYTES / 1024) * 1024,
    restApiEnabled: restApiEnabledRaw === "1",
  };
}
