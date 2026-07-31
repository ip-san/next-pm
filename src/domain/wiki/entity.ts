export interface WikiPage {
  id: string;
  projectId: string;
  title: string;
  parentId: string | null;
  isProtected: boolean;
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
