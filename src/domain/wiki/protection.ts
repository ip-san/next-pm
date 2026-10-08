import type { WikiPage } from "./entity";

/**
 * Mirrors Redmine's WikiPage#editable_by? (wiki_page.rb#L214): protection is a second gate on
 * top of the permission the action itself needs. An unprotected page is writable by anyone the
 * action's own permission lets through; a protected one additionally demands protect_wiki_pages.
 *
 * It is deliberately *not* a restatement of edit_wiki_pages — Redmine applies the same
 * protection gate to renaming, deleting and attaching, each of which has its own permission.
 */
export function isWikiPageEditable(page: Pick<WikiPage, "isProtected">, canProtect: boolean): boolean {
  return !page.isProtected || canProtect;
}

/** Redmine's WikiPage::DEFAULT_PROTECTED_PAGES — the sidebar is protected the moment it is created. */
const DEFAULT_PROTECTED_TITLES = ["sidebar"];

export function isProtectedByDefault(title: string): boolean {
  return DEFAULT_PROTECTED_TITLES.includes(title.toLowerCase());
}
