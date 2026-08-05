import type { Commit } from "./entity";

// svn log's default (non-XML) output separates entries with a line of exactly 72 dashes —
// tolerate a shorter run too rather than hardcoding 72, in case a future svn version changes it.
const SEPARATOR = /^-{10,}$/m;
const HEADER = /^r(\d+) \| (.*?) \| (.*?) \| \d+ lines?$/;

/**
 * Parses `svn log`'s plain-text output (not `--xml`) — next-pm has no XML parser dependency, and
 * the plain format is simple enough to parse reliably: each entry's header line is
 * `r<rev> | <author> | <date> (<day>) | <n> lines`, followed by a blank line, then the full
 * commit message verbatim through the next separator.
 *
 * Subversion has no notion of a per-commit author *email* (unlike git) — `authorEmail` is
 * always empty, mirroring Commit's own doc comment for that case.
 */
export function parseSvnLog(output: string): Commit[] {
  const entries = output
    .split(SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const commits: Commit[] = [];
  for (const entry of entries) {
    const newlineIndex = entry.indexOf("\n");
    const headerLine = newlineIndex === -1 ? entry : entry.slice(0, newlineIndex);
    const header = HEADER.exec(headerLine);
    if (!header) continue;

    const [, revision, author, dateAndZone] = header;
    // Drops the trailing "(Wed, 05 Aug 2026)" day-name parenthetical — keeps just the
    // "YYYY-MM-DD HH:MM:SS +ZZZZ" portion, matching the plain date string GitCliBrowser produces.
    const date = dateAndZone.replace(/\s*\(.*\)$/, "");
    const message = newlineIndex === -1 ? "" : entry.slice(newlineIndex + 1).replace(/^\n/, "");

    commits.push({ hash: revision, author, authorEmail: "", date, message: message.trimEnd() });
  }
  return commits;
}
