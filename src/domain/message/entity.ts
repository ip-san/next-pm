export interface Message {
  id: string;
  boardId: string;
  parentId: string | null;
  authorId: string;
  subject: string;
  content: string;
  locked: boolean;
  sticky: boolean;
  repliesCount: number;
  createdAt: Date;
}
