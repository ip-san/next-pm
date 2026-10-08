import type { SearchCriteria } from "@/domain/search/entity";
import type { Message } from "./entity";

export interface MessageRepository {
  findById(id: string): Promise<Message | null>;
  /** Sticky topics first, as Redmine's `reorder(:sticky => :desc)` on the board page. */
  listTopicsByBoard(boardId: string): Promise<Message[]>;
  /** Every message (topic or reply) across every board in the project — activity feed. */
  listByProject(projectId: string): Promise<Message[]>;
  listReplies(parentId: string): Promise<Message[]>;
  create(message: Omit<Message, "id" | "repliesCount" | "createdAt">): Promise<Message>;
  update(id: string, changes: { subject?: string; content?: string; locked?: boolean; sticky?: boolean }): Promise<Message>;
  /**
   * Moves a whole thread to another board — Redmine's `update_messages_board`, which runs
   * `Message.where("id = ? OR parent_id = ?", root.id, root.id).update_all(:board_id => ...)`
   * so replies never stay behind on the old board.
   */
  moveThreadToBoard(topicId: string, boardId: string): Promise<void>;
  delete(id: string): Promise<void>;
  incrementRepliesCount(parentId: string): Promise<void>;
  /**
   * Full-text search over subject/content, scoped to one project. Messages have no projectId
   * column of their own — the implementation must join through boards.project_id.
   */
  search(projectIds: string[], criteria: SearchCriteria): Promise<Message[]>;
}
