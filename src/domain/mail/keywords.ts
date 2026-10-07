/**
 * Port of Redmine's `MailHandler#get_keyword` / `#extract_keyword!`: a sender can set issue
 * attributes by writing `Status: 解決` on its own line in the body, and the matched line is then
 * removed from the text that becomes the description or the note.
 *
 * Two Redmine rules this keeps:
 *
 * - a keyword is only honoured when the receiving side opted in via `allow_override`
 *   (a comma-separated list of attribute names, or `all`);
 * - matching is case-insensitive and accepts either the English attribute name or its label in
 *   the default language. next-pm has no i18n and ships a Japanese UI, so the accepted labels
 *   are the hardcoded pair (English attribute name, Redmine's ja.yml `field_*` label) rather
 *   than something resolved per user.
 */

export const ISSUE_KEYWORD_ATTRIBUTES = [
  "project",
  "tracker",
  "status",
  "priority",
  "category",
  "assigned_to",
  "fixed_version",
  "start_date",
  "due_date",
  "estimated_hours",
  "done_ratio",
  "is_private",
  "parent_issue",
] as const;

export type IssueKeywordAttribute = (typeof ISSUE_KEYWORD_ATTRIBUTES)[number];

/** English name first (Redmine's `attr.to_s.humanize`), then the ja.yml `field_*` label. */
const KEYWORD_LABELS: Record<IssueKeywordAttribute, string[]> = {
  project: ["Project", "プロジェクト"],
  tracker: ["Tracker", "トラッカー"],
  status: ["Status", "ステータス"],
  priority: ["Priority", "優先度"],
  category: ["Category", "カテゴリ"],
  assigned_to: ["Assigned to", "担当者"],
  fixed_version: ["Fixed version", "対象バージョン"],
  start_date: ["Start date", "開始日"],
  due_date: ["Due date", "期日"],
  estimated_hours: ["Estimated hours", "予定工数"],
  done_ratio: ["Done ratio", "進捗率"],
  is_private: ["Is private", "プライベート"],
  parent_issue: ["Parent issue", "親チケット"],
};

const DATE_FORMAT = "\\d{4}-\\d{2}-\\d{2}";
const DONE_RATIO_FORMAT = "(?:\\d|10)?0";

const KEYWORD_FORMATS: Partial<Record<IssueKeywordAttribute, string>> = {
  start_date: DATE_FORMAT,
  due_date: DATE_FORMAT,
  done_ratio: DONE_RATIO_FORMAT,
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordRegExp(labels: string[], format: string): RegExp {
  const names = labels.map(escapeRegExp).join("|");
  return new RegExp(`^(?:${names})[ \\t]*:[ \\t]*(${format})[ \\t]*$`, "im");
}

export interface ExtractedKeyword {
  value: string;
  /** The body with the matched keyword line removed, as Redmine's destructive `sub!` leaves it. */
  text: string;
}

/**
 * Finds `Label: value` on a line of its own and returns the value together with the body it
 * was removed from. `labels` are matched case-insensitively; `format` restricts what counts as
 * a value, so `Due date: tomorrow` is simply not a keyword.
 */
export function extractKeyword(text: string, labels: string[], format = ".+"): ExtractedKeyword | null {
  const regexp = keywordRegExp(labels, format);
  const match = regexp.exec(text);
  if (!match) {
    return null;
  }
  // Swallow the line's own newline so removing a keyword doesn't leave a blank line behind.
  const consumed = text.slice(match.index + match[0].length).startsWith("\n") ? match[0] + "\n" : match[0];
  return {
    value: match[1].trim(),
    text: text.slice(0, match.index) + text.slice(match.index + consumed.length),
  };
}

/** `allow_override` as Redmine normalizes it: trimmed, lower-cased, inner spaces to underscores. */
export function parseAllowOverride(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter((entry) => entry.length > 0);
}

export interface KeywordExtractionOptions {
  /** Normalized `allow_override` list; `all` enables every attribute. */
  allowOverride: string[];
  /** Names of the custom fields that may also be set from the body. */
  customFieldNames: string[];
}

export interface ExtractedKeywords {
  attributes: Partial<Record<IssueKeywordAttribute, string>>;
  /** Custom field name -> raw value, still unparsed. */
  customFields: Record<string, string>;
  /** The body with every matched keyword line removed. */
  body: string;
}

function isOverridable(allowOverride: string[], name: string): boolean {
  return allowOverride.includes("all") || allowOverride.includes(name.toLowerCase().replace(/\s+/g, "_"));
}

/**
 * Runs every keyword over the body once, left to right, and returns both the values found and
 * the body stripped of them. Attributes not listed in `allow_override` are left in the text —
 * Redmine's `get_keyword` doesn't even look for them, so `Status: X` stays visible in the note.
 */
export function extractIssueKeywords(body: string, options: KeywordExtractionOptions): ExtractedKeywords {
  let text = body;
  const attributes: Partial<Record<IssueKeywordAttribute, string>> = {};

  for (const attribute of ISSUE_KEYWORD_ATTRIBUTES) {
    if (!isOverridable(options.allowOverride, attribute)) continue;
    const extracted = extractKeyword(text, KEYWORD_LABELS[attribute], KEYWORD_FORMATS[attribute]);
    if (extracted) {
      attributes[attribute] = extracted.value;
      text = extracted.text;
    }
  }

  const customFields: Record<string, string> = {};
  for (const name of options.customFieldNames) {
    if (!isOverridable(options.allowOverride, name)) continue;
    const extracted = extractKeyword(text, [name]);
    if (extracted) {
      customFields[name] = extracted.value;
      text = extracted.text;
    }
  }

  return { attributes, customFields, body: text.trim() };
}

/** Redmine's `get_keyword_bool`: "1"/"0" plus the yes/no words of the active locale. */
export function parseKeywordBool(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (["1", "yes", "true", "はい"].includes(normalized)) return true;
  if (["0", "no", "false", "いいえ"].includes(normalized)) return false;
  return null;
}
