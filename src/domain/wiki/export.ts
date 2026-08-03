import type { WikiPage } from "./entity";

/**
 * Mirrors the page listing Redmine's wiki export renders (a title index followed by every
 * page's content) — ordered alphabetically by title rather than Redmine's parent/child
 * hierarchy tree, a deliberate simplification: a flat, sorted list is unambiguous and needs no
 * cycle-safety handling, at the cost of not visually nesting sub-pages under their parent.
 */
export function sortWikiPagesForExport(pages: WikiPage[]): WikiPage[] {
  return [...pages].sort((a, b) => a.title.localeCompare(b.title));
}
