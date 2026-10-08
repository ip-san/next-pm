/**
 * A project's wiki settings. Redmine's Wiki record also owns the pages; here pages hang off
 * the project directly, so this carries only the start page (Wiki#start_page).
 */
export interface Wiki {
  id: string;
  projectId: string;
  startPage: string;
}

/** Redmine's Wiki.create_default — the start page a project gets before anyone changes it. */
export const DEFAULT_WIKI_START_PAGE = "Wiki";

export interface WikiPage {
  id: string;
  projectId: string;
  title: string;
  parentId: string | null;
  isProtected: boolean;
}

/** A stale title left behind by a rename, resolving to the page's current title (never chained — see WikiRedirectRepository.retarget). */
export interface WikiRedirect {
  id: string;
  projectId: string;
  title: string;
  redirectsToTitle: string;
  createdAt: Date;
}

export interface WikiContentVersion {
  id: string;
  pageId: string;
  version: number;
  authorId: string;
  text: string;
  comments: string;
  createdAt: Date;
}
