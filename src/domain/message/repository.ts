import type { Message } from "./entity";

export interface MessageRepository {
  findById(id: string): Promise<Message | null>;
  /** Messages whose uuid starts with `prefix` — the "msg1a2b3c4d" token a mail reply carries. */
  findByIdPrefix(prefix: string): Promise<Message[]>;
  listTopicsByBoard(boardId: string): Promise<Message[]>;
  /** Every message (topic or reply) across every board in the project — activity feed. */
  listByProject(projectId: string): Promise<Message[]>;
  listReplies(parentId: string): Promise<Message[]>;
  create(message: Omit<Message, "id" | "repliesCount" | "createdAt">): Promise<Message>;
  update(id: string, changes: { subject?: string; content?: string; locked?: boolean; sticky?: boolean }): Promise<Message>;
  delete(id: string): Promise<void>;
  incrementRepliesCount(parentId: string): Promise<void>;
  /**
   * Full-text search over subject/content, scoped to one project. Messages have no projectId
   * column of their own — the implementation must join through boards.project_id.
   */
  search(projectId: string, query: string): Promise<Message[]>;
}
