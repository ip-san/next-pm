/**
 * Maps to Redmine settings.yml keys that next-pm previously hardcoded rather than exposed.
 * Every default below preserves next-pm's prior hardcoded behavior exactly (not necessarily
 * Redmine's own default — see timelog_accept_0_hours and cross_project_issue_relations, both
 * of which next-pm previously hardcoded to the *opposite* of Redmine's default), so shipping
 * this settings page doesn't silently change anything for existing deployments until an admin
 * explicitly changes a value — same reasoning as commit-keywords.ts's defaults.
 */
export const GENERAL_SETTING_KEYS = [
  "attachment_max_size",
  "rest_api_enabled",
  "feeds_limit",
  "activity_days_default",
  "timelog_accept_0_hours",
  "repository_log_display_limit",
  "cross_project_issue_relations",
  "issue_done_ratio",
] as const;

export const ISSUE_DONE_RATIO_VALUES = ["issue_field", "issue_status"] as const;
export type IssueDoneRatioMode = (typeof ISSUE_DONE_RATIO_VALUES)[number];

export type GeneralSettingKey = (typeof GENERAL_SETTING_KEYS)[number];

const PRIOR_HARDCODED_MAX_SIZE_BYTES = 25 * 1024 * 1024;
const PRIOR_HARDCODED_FEED_ENTRY_LIMIT = 25;
const PRIOR_HARDCODED_ACTIVITY_DAYS = 30;
const PRIOR_HARDCODED_REPOSITORY_LOG_LIMIT = 10;

export const GENERAL_SETTING_DEFAULTS: Record<GeneralSettingKey, string> = {
  attachment_max_size: String(PRIOR_HARDCODED_MAX_SIZE_BYTES / 1024),
  rest_api_enabled: "1",
  feeds_limit: String(PRIOR_HARDCODED_FEED_ENTRY_LIMIT),
  activity_days_default: String(PRIOR_HARDCODED_ACTIVITY_DAYS),
  // next-pm previously rejected 0-hour entries unconditionally — the opposite of Redmine's
  // own default (accept). Defaulting to "0" (reject) here preserves that prior behavior.
  timelog_accept_0_hours: "0",
  repository_log_display_limit: String(PRIOR_HARDCODED_REPOSITORY_LOG_LIMIT),
  // next-pm previously rejected cross-project issue relations unconditionally — the opposite
  // of Redmine's own default (allow). Defaulting to "0" (reject) here preserves that prior
  // behavior.
  cross_project_issue_relations: "0",
  // next-pm previously never derived done_ratio from status at all (only the SCM commit-hook
  // path did) — "issue_field" (manual, Redmine's own default too) preserves that.
  issue_done_ratio: "issue_field",
};

export interface GeneralSettings {
  attachmentMaxSizeBytes: number;
  restApiEnabled: boolean;
  feedsLimit: number;
  activityDaysDefault: number;
  timelogAccept0Hours: boolean;
  repositoryLogDisplayLimit: number;
  crossProjectIssueRelations: boolean;
  issueDoneRatio: IssueDoneRatioMode;
}

function positiveIntOr(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return raw !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveGeneralSettings(overrides: Record<string, string>): GeneralSettings {
  const maxSizeKb = positiveIntOr(overrides.attachment_max_size, Number(GENERAL_SETTING_DEFAULTS.attachment_max_size));
  const restApiEnabledRaw = overrides.rest_api_enabled ?? GENERAL_SETTING_DEFAULTS.rest_api_enabled;

  return {
    attachmentMaxSizeBytes: maxSizeKb * 1024,
    restApiEnabled: restApiEnabledRaw === "1",
    feedsLimit: positiveIntOr(overrides.feeds_limit, PRIOR_HARDCODED_FEED_ENTRY_LIMIT),
    activityDaysDefault: positiveIntOr(overrides.activity_days_default, PRIOR_HARDCODED_ACTIVITY_DAYS),
    timelogAccept0Hours: (overrides.timelog_accept_0_hours ?? GENERAL_SETTING_DEFAULTS.timelog_accept_0_hours) === "1",
    repositoryLogDisplayLimit: positiveIntOr(overrides.repository_log_display_limit, PRIOR_HARDCODED_REPOSITORY_LOG_LIMIT),
    crossProjectIssueRelations: (overrides.cross_project_issue_relations ?? GENERAL_SETTING_DEFAULTS.cross_project_issue_relations) === "1",
    issueDoneRatio: ISSUE_DONE_RATIO_VALUES.includes(overrides.issue_done_ratio as IssueDoneRatioMode)
      ? (overrides.issue_done_ratio as IssueDoneRatioMode)
      : (GENERAL_SETTING_DEFAULTS.issue_done_ratio as IssueDoneRatioMode),
  };
}
