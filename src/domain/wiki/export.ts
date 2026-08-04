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

// Every run of one or more of these characters collapses to a single "_" — critically, the
// separator itself never survives, so a title shaped like "../../etc/passwd" can't reconstruct
// a multi-segment path inside the archive; it becomes one flat filename with underscores where
// the slashes were. Mirrors WikiController#archived_wiki_page_filename's regex exactly.
const UNSAFE_FILENAME_CHARS = /[/?%*:|"'<>\n\r]+/g;

/** Mirrors archived_wiki_page_filename's sanitization step (minus the ".txt" extension/dedup). */
export function sanitizeWikiPageFilename(title: string): string {
  return title.replaceAll("\\", "_").replace(UNSAFE_FILENAME_CHARS, "_");
}

/**
 * Mirrors WikiController#archived_wiki_page_filename: sanitizes the title into a filename, then
 * disambiguates against every filename already used in this archive by appending "(N)" before
 * the extension — same as Redmine's dup_count loop. `usedFilenames` is mutated (the caller's set
 * gains this entry) so a caller iterating multiple pages needs only one shared set across calls.
 */
export function archivedWikiPageFilename(title: string, usedFilenames: Set<string>): string {
  const extension = ".txt";
  const sanitizedTitle = sanitizeWikiPageFilename(title);
  let filename = `${sanitizedTitle}${extension}`;
  let dupCount = 0;
  while (usedFilenames.has(filename)) {
    dupCount += 1;
    filename = `${sanitizedTitle}(${dupCount})${extension}`;
  }
  usedFilenames.add(filename);
  return filename;
}
