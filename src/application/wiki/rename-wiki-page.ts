import { DEFAULT_WIKI_START_PAGE, type WikiPage } from "@/domain/wiki/entity";
import { isWikiPageEditable } from "@/domain/wiki/protection";
import type { WikiPageRepository, WikiRedirectRepository, WikiRepository } from "@/domain/wiki/repository";
import { WikiPageProtectedError } from "./save-wiki-page";
import { resolveWikiPageParent } from "./set-wiki-page-parent";

export class WikiPageNotFoundError extends Error {}
export class WikiTitleConflictError extends Error {}

export interface RenameWikiPageInput {
  pageId: string;
  newTitle: string;
  keepRedirect: boolean;
  /** `undefined` leaves the parent alone; null detaches the page to the root. */
  parentId: string | null | undefined;
  /**
   * The actor asking for this page to become the wiki's start page — Redmine's
   * is_start_page setter, a safe attribute only under manage_wiki, so the caller passes
   * false when the actor lacks it. A page that already *is* the start page keeps the
   * setting regardless, since that follows the page rather than the permission.
   */
  markAsStartPage: boolean;
  /** Redmine gates `rename` on editable? as well as on rename_wiki_pages — see domain/wiki/protection.ts. */
  canProtect: boolean;
}

/**
 * Mirrors Redmine's WikiPage#handle_rename_or_move: retarget any redirect that pointed at the
 * old title so it points directly at the new one (collapsing chains rather than leaving A→B→C),
 * drop a stale redirect that would now collide with the new title, then optionally leave a
 * fresh redirect behind from the old title.
 */
export async function renameWikiPage(
  repositories: {
    wikiPageRepository: WikiPageRepository;
    wikiRedirectRepository: WikiRedirectRepository;
    wikiRepository: WikiRepository;
  },
  input: RenameWikiPageInput,
): Promise<WikiPage> {
  const page = await repositories.wikiPageRepository.findById(input.pageId);
  if (!page) {
    throw new WikiPageNotFoundError(input.pageId);
  }
  if (!isWikiPageEditable(page, input.canProtect)) {
    throw new WikiPageProtectedError();
  }

  let current = page;
  if (input.parentId !== undefined && input.parentId !== current.parentId) {
    const parentId = await resolveWikiPageParent(repositories.wikiPageRepository, current.projectId, current, input.parentId);
    current = await repositories.wikiPageRepository.setParent(current.id, parentId);
  }

  const wiki = await repositories.wikiRepository.findByProject(current.projectId);
  const wasStartPage = (wiki?.startPage ?? DEFAULT_WIKI_START_PAGE) === current.title;

  const oldTitle = current.title;
  const newTitle = input.newTitle;
  if (oldTitle === newTitle) {
    if (input.markAsStartPage && !wasStartPage) {
      await repositories.wikiRepository.setStartPage(current.projectId, current.title);
    }
    return current;
  }

  const conflict = await repositories.wikiPageRepository.findByTitle(current.projectId, newTitle);
  if (conflict) {
    throw new WikiTitleConflictError(newTitle);
  }

  await repositories.wikiRedirectRepository.retarget(current.projectId, oldTitle, newTitle);
  await repositories.wikiRedirectRepository.deleteByTitle(current.projectId, newTitle);
  const renamed = await repositories.wikiPageRepository.rename(current.id, newTitle);
  if (input.keepRedirect) {
    await repositories.wikiRedirectRepository.create({ projectId: current.projectId, title: oldTitle, redirectsToTitle: newTitle });
  }

  // WikiPage#update_wiki_start_page, a before_save: the setting follows the page it names.
  if (wasStartPage || input.markAsStartPage) {
    await repositories.wikiRepository.setStartPage(current.projectId, renamed.title);
  }

  return renamed;
}
