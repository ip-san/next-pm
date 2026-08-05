import type { KeywordScanOptions } from "@/domain/scm/keyword-scan";

/**
 * Maps to Redmine's commit_ref_keywords / commit_update_keywords / commit_logtime_enabled
 * settings (config/settings.yml + Setting model). Two deliberate simplifications versus real
 * Redmine, both already baked into sync-changesets.ts before this settings page existed:
 *
 * - commit_update_keywords here is a flat keyword list, not Redmine's serialized array of
 *   {keywords, if_tracker_id, status_id, ...} rules — next-pm's fix action always targets the
 *   lowest-position closed status regardless of tracker, so per-rule/per-tracker status mapping
 *   has no effect to apply. If per-tracker close targets are ever added, this is where the
 *   richer shape would need to come back.
 * - commit_logtime_enabled defaults to "1" here, not Redmine's "0" — next-pm shipped automatic
 *   time logging as always-on before this setting existed, so defaulting to Redmine's off
 *   would silently disable already-verified, already-relied-upon behavior for existing
 *   projects the moment this settings page shipped. Admins can still turn it off explicitly.
 */
export const COMMIT_KEYWORD_SETTING_KEYS = [
  "commit_ref_keywords",
  "commit_update_keywords",
  "commit_logtime_enabled",
] as const;

export type CommitKeywordSettingKey = (typeof COMMIT_KEYWORD_SETTING_KEYS)[number];

export const COMMIT_KEYWORD_SETTING_DEFAULTS: Record<CommitKeywordSettingKey, string> = {
  commit_ref_keywords: "refs,references",
  commit_update_keywords: "fixes,closes,fix,close",
  commit_logtime_enabled: "1",
};

export interface CommitKeywordSettings {
  keywordScanOptions: KeywordScanOptions;
  logtimeEnabled: boolean;
}

export function parseKeywordList(raw: string): string[] {
  return raw
    .split(",")
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);
}

export function serializeKeywordList(keywords: string[]): string {
  return keywords.join(",");
}

/** Reads persisted overrides (falling back to defaults for any key not yet set) into the typed shape sync-changesets.ts consumes. */
export function resolveCommitKeywordSettings(overrides: Record<string, string>): CommitKeywordSettings {
  const refKeywordsRaw = overrides.commit_ref_keywords ?? COMMIT_KEYWORD_SETTING_DEFAULTS.commit_ref_keywords;
  const fixKeywordsRaw = overrides.commit_update_keywords ?? COMMIT_KEYWORD_SETTING_DEFAULTS.commit_update_keywords;
  const logtimeEnabledRaw = overrides.commit_logtime_enabled ?? COMMIT_KEYWORD_SETTING_DEFAULTS.commit_logtime_enabled;

  return {
    keywordScanOptions: {
      refKeywords: parseKeywordList(refKeywordsRaw),
      fixKeywords: parseKeywordList(fixKeywordsRaw),
    },
    logtimeEnabled: logtimeEnabledRaw === "1",
  };
}
