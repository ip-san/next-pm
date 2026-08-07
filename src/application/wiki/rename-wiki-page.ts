import type { WikiPage } from "@/domain/wiki/entity";
import type { WikiPageRepository, WikiRedirectRepository } from "@/domain/wiki/repository";

export class WikiPageNotFoundError extends Error {}
export class WikiTitleConflictError extends Error {}

export interface RenameWikiPageInput {
  pageId: string;
  newTitle: string;
  keepRedirect: boolean;
}

/**
 * Mirrors Redmine's WikiPage#handle_rename_or_move: retarget any redirect that pointed at the
 * old title so it points directly at the new one (collapsing chains rather than leaving A→B→C),
 * drop a stale redirect that would now collide with the new title, then optionally leave a
 * fresh redirect behind from the old title.
 */
export async function renameWikiPage(
  repositories: { wikiPageRepository: WikiPageRepository; wikiRedirectRepository: WikiRedirectRepository },
  input: RenameWikiPageInput,
): Promise<WikiPage> {
  const page = await repositories.wikiPageRepository.findById(input.pageId);
  if (!page) {
    throw new WikiPageNotFoundError(input.pageId);
  }

  const oldTitle = page.title;
  const newTitle = input.newTitle;
  if (oldTitle === newTitle) {
    return page;
  }

  const conflict = await repositories.wikiPageRepository.findByTitle(page.projectId, newTitle);
  if (conflict) {
    throw new WikiTitleConflictError(newTitle);
  }

  await repositories.wikiRedirectRepository.retarget(page.projectId, oldTitle, newTitle);
  await repositories.wikiRedirectRepository.deleteByTitle(page.projectId, newTitle);
  const renamed = await repositories.wikiPageRepository.rename(page.id, newTitle);
  if (input.keepRedirect) {
    await repositories.wikiRedirectRepository.create({ projectId: page.projectId, title: oldTitle, redirectsToTitle: newTitle });
  }

  return renamed;
}
