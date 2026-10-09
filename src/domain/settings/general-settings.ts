import { parsePerPageOptions, PER_PAGE_OPTIONS_DEFAULT } from "@/domain/query/pagination";
import { DEFAULT_LOCALE, localeFor, type Locale } from "@/domain/i18n/locales";

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
  "webhooks_enabled",
  "display_subprojects_issues",
  "default_language",
  "force_default_language_for_anonymous",
  "force_default_language_for_loggedin",
  "per_page_options",
  "issues_export_limit",
  "parent_issue_dates",
  "parent_issue_priority",
  "parent_issue_done_ratio",
] as const;

export const ISSUE_DONE_RATIO_VALUES = ["issue_field", "issue_status"] as const;
export type IssueDoneRatioMode = (typeof ISSUE_DONE_RATIO_VALUES)[number];

/** Redmine's parent_issue_* settings: roll the value up from the subtasks, or leave it alone. */
export const PARENT_ISSUE_ROLLUP_VALUES = ["derived", "independent"] as const;
export type ParentIssueRollupMode = (typeof PARENT_ISSUE_ROLLUP_VALUES)[number];

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
  // Redmine's own default too (settings.yml webhooks_enabled: 0) — an outbound HTTP channel
  // stays off until an admin turns it on.
  webhooks_enabled: "0",
  // Redmine defaults this on (settings.yml display_subprojects_issues: 1). next-pm's issue lists have
  // never included subprojects, so off keeps existing screens as they were until an admin opts in.
  display_subprojects_issues: "0",
  // The interface has always been Japanese, so `ja` stays the default (Redmine's settings.yml default is en).
  default_language: "ja",
  force_default_language_for_anonymous: "0",
  force_default_language_for_loggedin: "0",
  // Both match Redmine's own settings.yml defaults. The issue list had no pagination at all
  // before, so there's no prior next-pm behavior to preserve here.
  per_page_options: PER_PAGE_OPTIONS_DEFAULT,
  issues_export_limit: "500",
  // Redmine defaults all three to "derived". next-pm has never rolled anything up from
  // subtasks, so defaulting to "independent" keeps existing deployments behaving exactly as
  // before until an admin opts in — the same rule the rest of this file follows.
  parent_issue_dates: "independent",
  parent_issue_priority: "independent",
  parent_issue_done_ratio: "independent",
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
  webhooksEnabled: boolean;
  /**
   * Redmine's display_subprojects_issues: the project's screens also list the issues of its
   * subprojects. Off by default here (see GENERAL_SETTING_DEFAULTS).
   */
  displaySubprojectsIssues: boolean;
  /** Redmine's default_language: the interface language when a request has no better answer. */
  defaultLanguage: Locale;
  /** Redmine's force_default_language_for_anonymous: ignore the browser's language for anonymous visitors. */
  forceDefaultLanguageForAnonymous: boolean;
  /** Redmine's force_default_language_for_loggedin: every signed-in user sees the default language. */
  forceDefaultLanguageForLoggedIn: boolean;
  /** Page sizes the issue/time-entry lists offer, already parsed and sorted. */
  perPageOptions: number[];
  /** Row cap on a CSV/PDF export, mirroring Redmine's `Setting.issues_export_limit`. */
  issuesExportLimit: number;
  parentIssueDates: ParentIssueRollupMode;
  parentIssuePriority: ParentIssueRollupMode;
  parentIssueDoneRatio: ParentIssueRollupMode;
}

function rollupMode(raw: string | undefined, key: GeneralSettingKey): ParentIssueRollupMode {
  return PARENT_ISSUE_ROLLUP_VALUES.includes(raw as ParentIssueRollupMode)
    ? (raw as ParentIssueRollupMode)
    : (GENERAL_SETTING_DEFAULTS[key] as ParentIssueRollupMode);
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
    webhooksEnabled: (overrides.webhooks_enabled ?? GENERAL_SETTING_DEFAULTS.webhooks_enabled) === "1",
    displaySubprojectsIssues: (overrides.display_subprojects_issues ?? GENERAL_SETTING_DEFAULTS.display_subprojects_issues) === "1",
    defaultLanguage: localeFor(overrides.default_language) ?? DEFAULT_LOCALE,
    forceDefaultLanguageForAnonymous: overrides.force_default_language_for_anonymous === "1",
    forceDefaultLanguageForLoggedIn: overrides.force_default_language_for_loggedin === "1",
    perPageOptions: parsePerPageOptions(overrides.per_page_options),
    issuesExportLimit: positiveIntOr(overrides.issues_export_limit, Number(GENERAL_SETTING_DEFAULTS.issues_export_limit)),
    parentIssueDates: rollupMode(overrides.parent_issue_dates, "parent_issue_dates"),
    parentIssuePriority: rollupMode(overrides.parent_issue_priority, "parent_issue_priority"),
    parentIssueDoneRatio: rollupMode(overrides.parent_issue_done_ratio, "parent_issue_done_ratio"),
  };
}
