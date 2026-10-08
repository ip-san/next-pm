import type { WikiPage } from "@/domain/wiki/entity";
import { wouldCreateParentCycle } from "@/domain/wiki/hierarchy";
import type { WikiPageRepository } from "@/domain/wiki/repository";

export class InvalidWikiParentError extends Error {
  constructor(public readonly reason: "not_found" | "cross_project" | "cycle") {
    super(`The requested parent page is not valid for this page (${reason}).`);
    this.name = "InvalidWikiParentError";
  }
}

/**
 * Mirrors WikiPage#validate_parent_title: the parent must exist, live in the same wiki, and
 * be neither the page itself nor one of its descendants. `page` is null while the page is
 * still being created, where only the first two rules can apply.
 *
 * Returns the parent id to store, so callers can hand the result straight to the repository.
 */
export async function resolveWikiPageParent(
  wikiPageRepository: WikiPageRepository,
  projectId: string,
  page: WikiPage | null,
  parentId: string | null,
): Promise<string | null> {
  if (parentId === null) {
    return null;
  }

  const pages = await wikiPageRepository.listForProject(projectId);
  const parent = pages.find((candidate) => candidate.id === parentId);
  if (!parent) {
    // Looking the id up globally tells "no such page" apart from "a page in another project",
    // which Redmine reports as :not_same_project.
    const elsewhere = await wikiPageRepository.findById(parentId);
    throw new InvalidWikiParentError(elsewhere ? "cross_project" : "not_found");
  }
  if (page && wouldCreateParentCycle(pages, page.id, parentId)) {
    throw new InvalidWikiParentError("cycle");
  }

  return parent.id;
}
