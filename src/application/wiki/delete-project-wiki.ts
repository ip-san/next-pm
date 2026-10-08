import { DEFAULT_WIKI_START_PAGE } from "@/domain/wiki/entity";
import type { WikiRepository } from "@/domain/wiki/repository";
import { purgeWikiPage, type DeleteWikiPageRepositories } from "./delete-wiki-page";

export type DeleteProjectWikiRepositories = DeleteWikiPageRepositories & {
  wikiRepository: WikiRepository;
};

/**
 * Mirrors WikisController#destroy: the project's whole wiki goes, then a default one takes
 * its place (`Wiki.create_default`). Here the wiki itself is just the start-page setting, so
 * "recreating" it means resetting that back to the default.
 *
 * Page protection deliberately does not apply — Redmine gates this on manage_wiki alone and
 * never consults editable?, since the wiki record is being destroyed rather than edited.
 */
export async function deleteProjectWiki(
  repositories: DeleteProjectWikiRepositories,
  projectId: string,
): Promise<void> {
  for (const page of await repositories.wikiPageRepository.listForProject(projectId)) {
    await purgeWikiPage(repositories, projectId, page.id, page.title);
  }
  // Wiki#delete_redirects: purging page by page only clears redirects that pointed at a
  // deleted title, so anything left dangling goes with the wiki itself.
  await repositories.wikiRedirectRepository.deleteAllForProject(projectId);
  await repositories.wikiRepository.setStartPage(projectId, DEFAULT_WIKI_START_PAGE);
}
