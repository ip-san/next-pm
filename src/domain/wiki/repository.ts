import type { Wiki, WikiContentVersion, WikiPage, WikiRedirect } from "./entity";

export interface WikiRepository {
  /** Null when the project has never had its start page changed — treat as DEFAULT_WIKI_START_PAGE. */
  findByProject(projectId: string): Promise<Wiki | null>;
  setStartPage(projectId: string, startPage: string): Promise<Wiki>;
}

export interface WikiPageRepository {
  listForProject(projectId: string): Promise<WikiPage[]>;
  findById(id: string): Promise<WikiPage | null>;
  findByTitle(projectId: string, title: string): Promise<WikiPage | null>;
  create(page: Omit<WikiPage, "id">): Promise<WikiPage>;
  rename(id: string, newTitle: string): Promise<WikiPage>;
  setParent(id: string, parentId: string | null): Promise<WikiPage>;
  setProtected(id: string, isProtected: boolean): Promise<WikiPage>;
  /** Cascades to the page's content versions (FK); children keep their row with parentId cleared. */
  delete(id: string): Promise<void>;
}

export interface WikiRedirectRepository {
  findByTitle(projectId: string, title: string): Promise<WikiRedirect | null>;
  /**
   * Repoints every redirect that targeted `oldTarget` to `newTarget` instead, so a lookup
   * never needs to follow more than one hop. A row that would become self-referential in the
   * process (its own title equals the new target) is deleted instead of updated.
   */
  retarget(projectId: string, oldTarget: string, newTarget: string): Promise<void>;
  deleteByTitle(projectId: string, title: string): Promise<void>;
  /** Mirrors WikiPage#delete_redirects: drops the redirects that pointed at a page being deleted. */
  deleteByTarget(projectId: string, title: string): Promise<void>;
  /** Mirrors Wiki#delete_redirects, the before_destroy on the wiki itself: every redirect goes. */
  deleteAllForProject(projectId: string): Promise<void>;
  create(entry: { projectId: string; title: string; redirectsToTitle: string }): Promise<WikiRedirect>;
}

export interface WikiSearchHit {
  page: WikiPage;
  currentVersion: WikiContentVersion;
}

export interface WikiVersionWithPage {
  page: WikiPage;
  version: WikiContentVersion;
}

export interface WikiContentRepository {
  /** Highest-version content row for the page, i.e. its current text. */
  findCurrent(pageId: string): Promise<WikiContentVersion | null>;
  findVersion(pageId: string, version: number): Promise<WikiContentVersion | null>;
  listVersions(pageId: string): Promise<WikiContentVersion[]>;
  /** Appends a new version — never mutates an existing row (mirrors WikiContentVersion's append-only history). */
  createVersion(entry: Omit<WikiContentVersion, "id" | "createdAt">): Promise<WikiContentVersion>;
  /** Full-text search over each page's title and its *current* version's text, scoped to one project. */
  search(projectId: string, query: string): Promise<WikiSearchHit[]>;
  /** Every version of every page in the project (not just the current one) — activity feed. */
  listByProject(projectId: string): Promise<WikiVersionWithPage[]>;
  /** Each page's current version only — Redmine's `WikiPage.with_updated_on` scope, used by the index views. */
  listCurrentByProject(projectId: string): Promise<WikiVersionWithPage[]>;
}
