import type { WikiPage } from "./entity";

type PageNode = Pick<WikiPage, "id" | "parentId">;

/** Direct children only — Redmine's `acts_as_tree` `children`, ordered by the caller's own order. */
export function childrenOf<T extends PageNode>(pages: readonly T[], pageId: string | null): T[] {
  return pages.filter((page) => page.parentId === pageId);
}

/**
 * Every page below `pageId`, excluding the page itself — Redmine's `descendants`. Walks the
 * tree breadth-first from the page's own children, so a pre-existing parent loop in the data
 * terminates instead of spinning (each id is visited at most once).
 */
export function descendantIds(pages: readonly PageNode[], pageId: string): Set<string> {
  const found = new Set<string>();
  let frontier = [pageId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const page of pages) {
      if (page.parentId !== null && frontier.includes(page.parentId) && !found.has(page.id) && page.id !== pageId) {
        found.add(page.id);
        next.push(page.id);
      }
    }
    frontier = next;
  }
  return found;
}

/** Redmine's `self_and_descendants` — the set a page may not be re-parented into. */
export function selfAndDescendantIds(pages: readonly PageNode[], pageId: string): Set<string> {
  const ids = descendantIds(pages, pageId);
  ids.add(pageId);
  return ids;
}

/**
 * Mirrors the circular-dependency half of `WikiPage#validate_parent_title`: a page may be
 * neither its own parent nor a child of one of its own descendants.
 */
export function wouldCreateParentCycle(pages: readonly PageNode[], pageId: string, newParentId: string): boolean {
  return selfAndDescendantIds(pages, pageId).has(newParentId);
}

/**
 * The page's ancestors from the root down — what Redmine's `wiki_page_breadcrumb` renders
 * (`page.ancestors.reverse`). Stops at the first unknown or already-seen id so a broken or
 * looping parent chain in the data yields a short trail rather than hanging.
 */
export function ancestorChain<T extends PageNode>(pages: readonly T[], page: PageNode): T[] {
  const byId = new Map(pages.map((candidate) => [candidate.id, candidate]));
  const chain: T[] = [];
  const seen = new Set<string>([page.id]);
  let parentId = page.parentId;
  while (parentId !== null && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (!parent) break;
    seen.add(parent.id);
    chain.unshift(parent);
    parentId = parent.parentId;
  }
  return chain;
}

export interface WikiPageTreeNode<T> {
  page: T;
  children: WikiPageTreeNode<T>[];
}

/**
 * Groups pages into the parent/child forest the index view renders (Redmine's
 * `@pages_by_parent_id`). A page whose parent is missing from `pages` — which only happens
 * if the caller filtered the list — is treated as a root rather than dropped.
 */
export function buildWikiPageTree<T extends PageNode>(pages: readonly T[]): WikiPageTreeNode<T>[] {
  const byParent = new Map<string | null, T[]>();
  const known = new Set(pages.map((page) => page.id));
  for (const page of pages) {
    const parentId = page.parentId !== null && known.has(page.parentId) ? page.parentId : null;
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), page]);
  }

  const build = (parentId: string | null, visited: Set<string>): WikiPageTreeNode<T>[] =>
    (byParent.get(parentId) ?? [])
      .filter((page) => !visited.has(page.id))
      .map((page) => {
        visited.add(page.id);
        return { page, children: build(page.id, visited) };
      });

  return build(null, new Set());
}
