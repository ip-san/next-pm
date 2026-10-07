/**
 * Port of Redmine's `MailHandler#cleanup_body`: everything from the first line that matches one
 * of the configured delimiters down to the end of the message is dropped. This is how Redmine
 * strips signatures and quoted reply history — there is no separate signature detector, the
 * admin lists the markers (`-- `, `________`, "-----Original Message-----", …) in
 * `mail_handler_body_delimiters`, one per line.
 */
export interface BodyDelimiterOptions {
  /** Raw `mail_handler_body_delimiters` value — one delimiter per line. */
  delimiters: string;
  /** `mail_handler_enable_regex_delimiters`: treat each line as a regular expression. */
  enableRegex: boolean;
}

/**
 * Mirrors the "allow a single space to match a line break and quote markers" rewrite Redmine
 * applies to literal delimiters, so a delimiter such as "-----Original Message-----" still
 * matches after a mail client has wrapped or quoted it.
 */
function literalDelimiterSource(delimiter: string): string {
  const escaped = delimiter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped.replace(/(\\? )+/g, "\\s*(\\s|[\\r\\n](\\s|>)*)");
}

function compileDelimiters(options: BodyDelimiterOptions): RegExp | null {
  const lines = options.delimiters
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return null;
  }

  const sources: string[] = [];
  for (const line of lines) {
    if (options.enableRegex) {
      try {
        // Compiled individually so one bad pattern is skipped instead of disabling the rest,
        // matching Redmine's rescue of RegexpError around the whole mapping.
        new RegExp(line);
        sources.push(line);
      } catch {
        continue;
      }
    } else {
      sources.push(literalDelimiterSource(line));
    }
  }
  if (sources.length === 0) {
    return null;
  }

  // Ruby's `^` is always per-line and `Regexp::MULTILINE` makes `.` match newlines; in
  // JavaScript that is "m" plus "s". The trailing `[\r\n].*` is what swallows the rest.
  return new RegExp(`^(\\s|>)*(?:${sources.map((source) => `(?:${source})`).join("|")})[^\\S\\r\\n]*[\\r\\n].*`, "ms");
}

export function cleanupBody(body: string, options: BodyDelimiterOptions): string {
  const regex = compileDelimiters(options);
  return (regex ? body.replace(regex, "") : body).trim();
}
