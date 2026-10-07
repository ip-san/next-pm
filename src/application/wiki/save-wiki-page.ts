import type { WikiContentVersion, WikiPage } from "@/domain/wiki/entity";
import { isProtectedByDefault, isWikiPageEditable } from "@/domain/wiki/protection";
import type { WikiContentRepository, WikiPageRepository } from "@/domain/wiki/repository";

export class WikiPageProtectedError extends Error {
  constructor() {
    super("This wiki page is protected and can only be changed with protect_wiki_pages.");
    this.name = "WikiPageProtectedError";
  }
}

export interface SaveWikiPageInput {
  projectId: string;
  title: string;
  text: string;
  comments: string;
  authorId: string;
  parentId: string | null;
  /** The actor's protect_wiki_pages — the only thing that unlocks a protected page (WikiPage#editable_by?). */
  canProtect: boolean;
}

/**
 * Creates the page (version 1) if `title` doesn't exist yet for this project, otherwise
 * appends a new WikiContentVersion — mirrors WikiContent's after_save history-append
 * behavior (wiki_content.rb#L87), never mutating a prior version's row.
 */
export async function saveWikiPage(
  repositories: { wikiPageRepository: WikiPageRepository; wikiContentRepository: WikiContentRepository },
  input: SaveWikiPageInput,
): Promise<{ page: WikiPage; version: WikiContentVersion }> {
  let page = await repositories.wikiPageRepository.findByTitle(input.projectId, input.title);
  if (page) {
    if (!isWikiPageEditable(page, input.canProtect)) {
      throw new WikiPageProtectedError();
    }
  } else {
    page = await repositories.wikiPageRepository.create({
      projectId: input.projectId,
      title: input.title,
      parentId: input.parentId,
      isProtected: isProtectedByDefault(input.title),
    });
  }

  const current = await repositories.wikiContentRepository.findCurrent(page.id);
  const version = await repositories.wikiContentRepository.createVersion({
    pageId: page.id,
    version: (current?.version ?? 0) + 1,
    authorId: input.authorId,
    text: input.text,
    comments: input.comments,
  });

  return { page, version };
}
