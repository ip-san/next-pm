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
