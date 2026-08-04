// Mirrors Redmine's Changeset#scan_comment_for_issue_ids and its TIMELOG_RE, adapted for
// next-pm's UUID-keyed issues: Redmine matches decimal issue numbers (#123); this matches the
// app's own 8-hex-char id-prefix shorthand (#eb0b2d1a, i.e. issue.id.slice(0, 8) — the same
// convention parse-email.ts/findByIdPrefix already use for the mail handler's reply detection).

export interface KeywordScanOptions {
  /** Case-insensitive. May include "*", meaning "any bare #<prefix> reference links, even with no keyword." */
  refKeywords: string[];
  /** Case-insensitive. A keyword here always takes precedence over a refKeywords match. */
  fixKeywords: string[];
}

export interface KeywordMatch {
  issueIdPrefix: string;
  action: "fix" | "ref";
  /** Hours parsed from a trailing "@2h"/"@90m"/"@1:30"/"@2" token, or null if none was present. */
  hours: number | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Mirrors Changeset::TIMELOG_RE's accepted shapes: "2h", "2h30m", "90m"/"90min", "1:30" (H:MM),
 * and a bare number (optionally with a "." or "," decimal separator and an optional trailing
 * "h") defaulting to hours. Returns null for anything else.
 */
export function parseTimelog(raw: string): number | null {
  const value = raw.trim();

  let match = /^(\d+)h(\d+)?m?$/i.exec(value);
  if (match) {
    return Number(match[1]) + (match[2] ? Number(match[2]) / 60 : 0);
  }

  match = /^(\d+)(?:m|min)$/i.exec(value);
  if (match) {
    return Number(match[1]) / 60;
  }

  match = /^(\d+):(\d+)$/.exec(value);
  if (match) {
    return Number(match[1]) + Number(match[2]) / 60;
  }

  match = /^(\d+(?:[.,]\d+)?)h?$/i.exec(value);
  if (match) {
    return Number(match[1].replace(",", "."));
  }

  return null;
}

// The lookahead keeps a longer hex run (e.g. a full 40-char SHA pasted into a commit message)
// from being misread as an 8-char issue prefix followed by stray hex characters.
const HEX8 = "[0-9a-f]{8}(?![0-9a-f])";
// Deliberately precise (mirrors TIMELOG_RE's own alternatives) rather than a loose greedy class
// like [\w:.,]+ — a loose class would swallow the comma that separates this ref from the next
// one in something like "#eb0b2d1a @1h, #a1b2c3d4 @30m", parsing "1h," as the time value.
const TIMELOG = "\\d+h(?:ours?)?(?:\\d+m(?:in)?)?|\\d+(?:h|hours?|m|min)|\\d+:\\d+|\\d+(?:[.,]\\d+)?h?";
const REF_TOKEN = `#${HEX8}(?:\\s+@(?:${TIMELOG}))?`;

/**
 * Scans a commit message for issue references. A reference only counts if it's either preceded
 * by one of `options.fixKeywords`/`options.refKeywords` (e.g. "fixes #eb0b2d1a", "refs #a1b2c3d4")
 * or, when `options.refKeywords` includes "*", stands alone with no keyword at all — mirrors
 * Redmine's `next unless action.present? || ref_keywords_any`: an unrelated word before a "#..."
 * (e.g. "see #eb0b2d1a") is not a configured keyword, so that reference is silently skipped
 * rather than treated as a bare/keyword-less link.
 */
export function scanCommitMessage(comment: string, options: KeywordScanOptions): KeywordMatch[] {
  const fixKeywords = new Set(options.fixKeywords.map((k) => k.toLowerCase()));
  const refKeywordsAny = options.refKeywords.includes("*");
  const namedRefKeywords = new Set(options.refKeywords.filter((k) => k !== "*").map((k) => k.toLowerCase()));

  const allKeywords = [...new Set([...namedRefKeywords, ...fixKeywords])];
  // "(?!)" never matches anything — keeps capture-group numbering identical whether or not any
  // real keyword is configured, rather than branching into two differently-shaped regexes.
  const keywordAlternation = allKeywords.length > 0 ? allKeywords.map(escapeRegExp).join("|") : "(?!)";

  const groupRe = new RegExp(`(?:\\b(${keywordAlternation})[:\\s]+)?(${REF_TOKEN}(?:[\\s,;&]+${REF_TOKEN})*)`, "gi");
  const tokenRe = new RegExp(`#(${HEX8})(?:\\s+@(${TIMELOG}))?`, "gi");

  const matches: KeywordMatch[] = [];
  for (const groupMatch of comment.matchAll(groupRe)) {
    const keyword = groupMatch[1]?.toLowerCase();
    const refsBlob = groupMatch[2];

    const isFix = keyword !== undefined && fixKeywords.has(keyword);
    const isRef = keyword !== undefined ? namedRefKeywords.has(keyword) : refKeywordsAny;
    if (!isFix && !isRef) continue;

    const action: "fix" | "ref" = isFix ? "fix" : "ref";
    for (const tokenMatch of refsBlob.matchAll(tokenRe)) {
      matches.push({
        issueIdPrefix: tokenMatch[1].toLowerCase(),
        action,
        hours: tokenMatch[2] ? parseTimelog(tokenMatch[2]) : null,
      });
    }
  }
  return matches;
}
