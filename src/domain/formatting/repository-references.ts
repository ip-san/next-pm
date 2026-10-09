/**
 * Redmine's wiki links, `[[Page]]`, `[[Page|label]]`, and the project-qualified `[[project:Page]]` and
 * `[[project:Page|label]]`, in formatted text. Code is left alone, as in issue-references.ts.
 */

export interface LinkTarget {
  href: string;
}

/** A wiki link's target, split as Redmine's parse_wiki_links splits it. */
export interface WikiReferenceTarget {
  /** The project named before the colon, or null when the link stays in the text's own project. */
  project: string | null;
  /** The page title, which is empty for `[[project:]]`. */
  title: string;
}

const CODE_SEGMENT = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;
const WIKI_REFERENCE = /\[\[([^\]\n|]+?)(?:\|([^\]\n]+?))?\]\]/g;

function proseSegments(source: string): { text: string; code: boolean }[] {
  return source.split(CODE_SEGMENT).map((text, index) => ({ text, code: index % 2 === 1 }));
}

/**
 * Splits a link's target at its first colon, as Redmine does: `project:Page` names a page of that project, and a
 * colon with nothing before it is part of the title.
 */
export function parseWikiTarget(target: string): WikiReferenceTarget {
  const colon = target.indexOf(":");
  if (colon <= 0) return { project: null, title: target.trim() };
  return { project: target.slice(0, colon).trim(), title: target.slice(colon + 1).trim() };
}

/** The distinct link targets the text names, as written (trimmed), in order of first appearance. */
export function wikiReferenceTargets(source: string): string[] {
  const targets: string[] = [];
  for (const segment of proseSegments(source)) {
    if (segment.code) continue;
    for (const match of segment.text.matchAll(WIKI_REFERENCE)) {
      const target = match[1].trim();
      if (target !== "" && !targets.includes(target)) targets.push(target);
    }
  }
  return targets;
}

/** A link label that can sit inside a markdown link's text without breaking it. */
function safeLabel(label: string): string {
  return label.replace(/[[\]()\\\r\n]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Rewrites each wiki link whose target the viewer may read into a markdown link. `links` is keyed by the target as
 * `wikiReferenceTargets` returns it. A reference with no link stays as written, so a missing page, a project the
 * viewer can't read, or one that doesn't exist shows only the text they typed.
 */
export function linkWikiReferences(source: string, links: ReadonlyMap<string, LinkTarget>): string {
  if (links.size === 0) return source;
  return proseSegments(source)
    .map((segment) =>
      segment.code
        ? segment.text
        : segment.text.replace(WIKI_REFERENCE, (match, rawTarget: string, rawLabel?: string) => {
            const target = links.get(rawTarget.trim());
            if (!target) return match;
            const { title } = parseWikiTarget(rawTarget);
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
