import type { AttachmentRepository, AttachmentStorage } from "@/domain/attachment/repository";
import type { WatcherRepository } from "@/domain/watcher/repository";
import { descendantIds, selfAndDescendantIds } from "@/domain/wiki/hierarchy";
import { isWikiPageEditable } from "@/domain/wiki/protection";
import type { WikiPageRepository, WikiRedirectRepository } from "@/domain/wiki/repository";
import { WikiPageNotFoundError } from "./rename-wiki-page";
import { WikiPageProtectedError } from "./save-wiki-page";

export class InvalidReassignTargetError extends Error {
  constructor(public readonly reason: "not_found" | "cross_project" | "descendant") {
    super(`The page chosen to adopt the children is not valid (${reason}).`);
    this.name = "InvalidReassignTargetError";
  }
}

/** Redmine's `params[:todo]` on WikiController#destroy. */
export type WikiChildrenDisposition = "nullify" | "destroy" | "reassign";

export interface DeleteWikiPageInput {
  pageId: string;
  /** Redmine defaults to nullify when the API caller sends no `todo`. */
  childrenDisposition: WikiChildrenDisposition;
  reassignToId: string | null;
  canProtect: boolean;
}

export interface DeleteWikiPageRepositories {
  wikiPageRepository: WikiPageRepository;
  wikiRedirectRepository: WikiRedirectRepository;
  attachmentRepository: AttachmentRepository;
  attachmentStorage: AttachmentStorage;
  watcherRepository: WatcherRepository;
}

/**
 * Mirrors WikiController#destroy: deleting a page with children first disposes of the
 * children — leave them as roots, delete the whole subtree, or hand them to another page —
 * and only then removes the page itself.
 *
 * The page row's own foreign keys only cascade to its content versions; redirects,
 * attachments and watchers all address the page polymorphically or by title, so each page
 * removed here is purged explicitly (Redmine gets this from WikiPage's `delete_redirects`
 * callback and from acts_as_attachable/acts_as_watchable's dependent destroys).
 */
export async function deleteWikiPage(
  repositories: DeleteWikiPageRepositories,
  input: DeleteWikiPageInput,
): Promise<void> {
  const page = await repositories.wikiPageRepository.findById(input.pageId);
  if (!page) {
    throw new WikiPageNotFoundError(input.pageId);
  }
  if (!isWikiPageEditable(page, input.canProtect)) {
    throw new WikiPageProtectedError();
  }

  const pages = await repositories.wikiPageRepository.listForProject(page.projectId);

  if (input.childrenDisposition === "destroy") {
    for (const id of descendantIds(pages, page.id)) {
      const descendant = pages.find((candidate) => candidate.id === id);
      if (descendant) {
        await purge(repositories, descendant.projectId, descendant.id, descendant.title);
      }
    }
  } else if (input.childrenDisposition === "reassign") {
    const target = pages.find((candidate) => candidate.id === input.reassignToId);
    if (!target) {
      // A target in another project never appears in this project's page list, so the two
      // cases are told apart by looking the id up globally before reporting "not found".
      const elsewhere = input.reassignToId ? await repositories.wikiPageRepository.findById(input.reassignToId) : null;
      throw new InvalidReassignTargetError(elsewhere ? "cross_project" : "not_found");
    }
    if (selfAndDescendantIds(pages, page.id).has(target.id)) {
      throw new InvalidReassignTargetError("descendant");
    }
    for (const child of pages.filter((candidate) => candidate.parentId === page.id)) {
      await repositories.wikiPageRepository.setParent(child.id, target.id);
    }
  }

  await purge(repositories, page.projectId, page.id, page.title);
}

async function purge(
  repositories: DeleteWikiPageRepositories,
  projectId: string,
  pageId: string,
  title: string,
): Promise<void> {
  for (const attachment of await repositories.attachmentRepository.listByContainer("WikiPage", pageId)) {
    await repositories.attachmentRepository.delete(attachment.id);
    await repositories.attachmentStorage.delete(attachment.storageKey);
  }
  await repositories.watcherRepository.unwatchAll("WikiPage", pageId);
  await repositories.wikiRedirectRepository.deleteByTarget(projectId, title);
  await repositories.wikiPageRepository.delete(pageId);
}
