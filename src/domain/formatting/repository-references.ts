/**
 * Redmine's wiki links, `[[Page]]` and `[[Page|label]]`, in formatted text. Code is left alone, as in
 * issue-references.ts.
 */

export interface LinkTarget {
  href: string;
}

const CODE_SEGMENT = /(```[\s\S]*?```|`[^`\n]*`)/g;
const WIKI_REFERENCE = /\[\[([^\]\n|]+?)(?:\|([^\]\n]+?))?\]\]/g;

function proseSegments(source: string): { text: string; code: boolean }[] {
  return source.split(CODE_SEGMENT).map((text, index) => ({ text, code: index % 2 === 1 }));
}

/** The distinct page titles the text links to, in order of first appearance. */
export function wikiReferenceTitles(source: string): string[] {
  const titles: string[] = [];
  for (const segment of proseSegments(source)) {
    if (segment.code) continue;
    for (const match of segment.text.matchAll(WIKI_REFERENCE)) {
      const title = match[1].trim();
      if (title !== "" && !titles.includes(title)) titles.push(title);
    }
  }
  return titles;
}

/** A link label that can sit inside a markdown link's text without breaking it. */
function safeLabel(label: string): string {
  return label.replace(/[[\]()\\\r\n]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Rewrites each `[[Page]]` whose page the viewer may read into a markdown link. A reference with no link stays as
 * written, so a missing page or one the viewer can't read shows only the text they typed.
 */
export function linkWikiReferences(source: string, links: ReadonlyMap<string, LinkTarget>): string {
  if (links.size === 0) return source;
  return proseSegments(source)
    .map((segment) =>
      segment.code
        ? segment.text
        : segment.text.replace(WIKI_REFERENCE, (match, rawTitle: string, rawLabel?: string) => {
            const title = rawTitle.trim();
            const target = links.get(title);
            if (!target) return match;
            return `[${safeLabel(rawLabel ?? title) || title}](${target.href})`;
          }),
    )
    .join("");
}

/** Redmine's revision references: `r` and the hex id of a commit, as a whole word. */
const REVISION_REFERENCE = /(^|[^\w&#/])r([0-9a-f]{7,40})(?!\w)/g;

/** The distinct revision ids the text names, in order of first appearance. */
export function revisionReferenceIds(source: string): string[] {
  const ids: string[] = [];
  for (const segment of proseSegments(source)) {
    if (segment.code) continue;
    for (const match of segment.text.matchAll(REVISION_REFERENCE)) {
      if (!ids.includes(match[2])) ids.push(match[2]);
    }
  }
  return ids;
}

/** Rewrites each `r<id>` that has a link into a markdown link to the changeset. */
export function linkRevisionReferences(source: string, links: ReadonlyMap<string, LinkTarget>): string {
  if (links.size === 0) return source;
  return proseSegments(source)
    .map((segment) =>
      segment.code
        ? segment.text
        : segment.text.replace(REVISION_REFERENCE, (match, prefix: string, id: string) => {
            const target = links.get(id);
            if (!target) return match;
            return `${prefix}[r${id}](${target.href})`;
          }),
    )
    .join("");
}
