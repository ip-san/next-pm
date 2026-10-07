import type { BoardRepository } from "@/domain/board/repository";
import type { Message } from "@/domain/message/entity";
import type { MessageRepository } from "@/domain/message/repository";
import { InvalidMessageError, validateMessageFields } from "@/domain/message/validate";

export { InvalidMessageError };

export interface EditMessageInput {
  message: Message;
  subject: string;
  content: string;
  /**
   * `locked`, `sticky` and `boardId` are Redmine's conditional safe attributes — the block
   * `:if => user.allowed_to?(:edit_messages, project)` means an author editing under
   * `edit_own_messages` can only change subject and content. The caller passes the resolved
   * flag; the fields below are then dropped rather than trusted.
   */
  canEditAllMessages: boolean;
  locked: boolean;
  sticky: boolean;
  /** Target board for a thread move. Must belong to the same project as the current board. */
  boardId: string;
}

/**
 * Mirrors MessagesController#edit. Moving a thread reproduces `Message#update_messages_board`,
 * which reassigns the root *and its replies* so a reply never keeps pointing at the old board.
 *
 * Redmine leaves the "same project" constraint to the form's option list; next-pm enforces it
 * here, because every authorization check downstream resolves the actor from the board's
 * project and a cross-project move would silently hand the thread to another project's roles.
 */
export async function editMessage(
  repositories: { messageRepository: MessageRepository; boardRepository: BoardRepository },
  input: EditMessageInput,
): Promise<Message> {
  validateMessageFields(input.subject, input.content);

  const isTopic = input.message.parentId === null;
  const changes: { subject: string; content: string; locked?: boolean; sticky?: boolean } = {
    subject: input.subject,
    content: input.content,
  };
  // locked/sticky live on the topic row; Redmine only renders them for a root message.
  if (input.canEditAllMessages && isTopic) {
    changes.locked = input.locked;
    changes.sticky = input.sticky;
  }

  const updated = await repositories.messageRepository.update(input.message.id, changes);

  if (!input.canEditAllMessages || !isTopic || input.boardId === input.message.boardId) {
    return updated;
  }

  const [currentBoard, targetBoard] = await Promise.all([
    repositories.boardRepository.findById(input.message.boardId),
    repositories.boardRepository.findById(input.boardId),
  ]);
  if (!targetBoard || !currentBoard || targetBoard.projectId !== currentBoard.projectId) {
    throw new InvalidMessageError("移動先のフォーラムが見つかりません。");
  }

  await repositories.messageRepository.moveThreadToBoard(input.message.id, targetBoard.id);
  return { ...updated, boardId: targetBoard.id };
}
