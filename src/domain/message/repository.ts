import type { Message } from "./entity";

export interface MessageRepository {
  findById(id: string): Promise<Message | null>;
  listTopicsByBoard(boardId: string): Promise<Message[]>;
  listReplies(parentId: string): Promise<Message[]>;
  create(message: Omit<Message, "id" | "repliesCount" | "createdAt">): Promise<Message>;
  update(id: string, changes: { subject?: string; content?: string; locked?: boolean; sticky?: boolean }): Promise<Message>;
  delete(id: string): Promise<void>;
  incrementRepliesCount(parentId: string): Promise<void>;
}
