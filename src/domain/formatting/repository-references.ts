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
  /** The page title, which is empty for `[[project:]]` (the project's start page) and for `[[#anchor]]`. */
  title: string;
  /** The section after `#`, as written, or null. `[[#anchor]]` alone is a section of the page the text is on. */
  anchor: string | null;
}

const CODE_SEGMENT = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;
const WIKI_REFERENCE = /\[\[([^\]\n|]+?)(?:\|([^\]\n]+?))?\]\]/g;

function proseSegments(source: string): { text: string; code: boolean }[] {
  return source.split(CODE_SEGMENT).map((text, index) => ({ text, code: index % 2 === 1 }));
}

/**
 * Splits a link's target as Redmine's parse_wiki_links does: `#anchor` alone is a section of this page; otherwise the
 * first colon separates a project (`project:Page`; a colon with nothing before it is part of the title), and the
 * first `#` after some title text separates the section (`Page#Section`).
 */
export function parseWikiTarget(target: string): WikiReferenceTarget {
  const trimmed = target.trim();
  if (/^#./.test(trimmed)) return { project: null, title: "", anchor: trimmed.slice(1) };
  const colon = trimmed.indexOf(":");
  const project = colon > 0 ? trimmed.slice(0, colon).trim() : null;
  const page = colon > 0 ? trimmed.slice(colon + 1).trim() : trimmed;
  const hash = page.indexOf("#", 1);
  if (hash > 0 && hash < page.length - 1) return { project, title: page.slice(0, hash).trim(), anchor: page.slice(hash + 1) };
  return { project, title: page, anchor: null };
}

/**
 * The text a link shows when it has no `|label`, as in Redmine: the page title, `#anchor` for a link within the page,
 * and the project as written for `[[project:]]`.
 */
export function wikiLinkLabel(target: WikiReferenceTarget): string {
  if (target.title !== "") return target.title;
  if (target.project !== null) return target.project;
  return target.anchor !== null ? `#${target.anchor}` : "";
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
            const label = wikiLinkLabel(parseWikiTarget(rawTarget));
            return `[${safeLabel(rawLabel ?? label) || safeLabel(label)}](${target.href})`;
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
