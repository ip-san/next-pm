export interface News {
  id: string;
  projectId: string;
  authorId: string;
  title: string;
  summary: string;
  description: string;
  createdAt: Date;
}

export interface NewsComment {
  id: string;
  newsId: string;
  authorId: string;
  content: string;
  createdAt: Date;
}
