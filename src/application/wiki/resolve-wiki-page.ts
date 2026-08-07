import type { WikiPage } from "@/domain/wiki/entity";
import type { WikiPageRepository, WikiRedirectRepository } from "@/domain/wiki/repository";

export interface ResolvedWikiPage {
  page: WikiPage;
  /** True when `title` was a stale, redirected title rather than the page's current one. */
  redirected: boolean;
}

/**
 * Mirrors Redmine's Wiki#find_page: look up the title directly first, and only fall back to a
 * redirect on a miss. The fallback is a single hop by construction (see
 * WikiRedirectRepository.retarget), so no loop detection is needed here.
 */
export async function resolveWikiPage(
  repositories: { wikiPageRepository: WikiPageRepository; wikiRedirectRepository: WikiRedirectRepository },
  projectId: string,
  title: string,
): Promise<ResolvedWikiPage | null> {
  const page = await repositories.wikiPageRepository.findByTitle(projectId, title);
  if (page) {
    return { page, redirected: false };
  }

  const redirect = await repositories.wikiRedirectRepository.findByTitle(projectId, title);
  if (!redirect) {
    return null;
  }

  const target = await repositories.wikiPageRepository.findByTitle(projectId, redirect.redirectsToTitle);
  return target ? { page: target, redirected: true } : null;
}
