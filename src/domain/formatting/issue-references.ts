/**
 * Redmine's `#123` issue references in formatted text. Code (fenced blocks and backtick spans) is left alone, and a
 * reference must start the text or follow a character that isn't part of a word, an entity or a path.
 */

export interface IssueLink {
  href: string;
  /** The issue's subject, shown on hover. Only given for an issue the viewer may see. */
  title: string;
}

const CODE_SEGMENT = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;
const ISSUE_REFERENCE = /(^|[^\w&#/])#(\d+)(?!\w)/g;

/** The text outside code, split into alternating [prose, code, prose, …] segments. */
function proseSegments(source: string): { text: string; code: boolean }[] {
  return source.split(CODE_SEGMENT).map((text, index) => ({ text, code: index % 2 === 1 }));
}

/** The distinct issue numbers the text references, in order of first appearance. */
export function issueReferenceNumbers(source: string): number[] {
  const numbers: number[] = [];
  for (const segment of proseSegments(source)) {
    if (segment.code) continue;
    for (const match of segment.text.matchAll(ISSUE_REFERENCE)) {
      const number = Number(match[2]);
      if (number > 0 && !numbers.includes(number)) numbers.push(number);
    }
  }
  return numbers;
}

/** A hover title that can sit inside a markdown link's quoted title without breaking the markup. */
function safeTitle(title: string): string {
  return title.replace(/["\\\[\]()<>\r\n]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Rewrites each `#N` in the text that has a link into a markdown link to the issue. A number with no link (an issue
 * the viewer can't see, or one that doesn't exist) stays as the bare `#N`, so nothing about it leaks.
 */
export function linkIssueReferences(source: string, links: ReadonlyMap<number, IssueLink>): string {
  if (links.size === 0) return source;
  return proseSegments(source)
    .map((segment) =>
      segment.code
        ? segment.text
        : segment.text.replace(ISSUE_REFERENCE, (match, prefix: string, digits: string) => {
            const link = links.get(Number(digits));
            if (!link) return match;
            return `${prefix}[#${digits}](${link.href} "${safeTitle(link.title)}")`;
          }),
    )
    .join("");
}
