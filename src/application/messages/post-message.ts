import type { Message } from "@/domain/message/entity";
import type { MessageRepository } from "@/domain/message/repository";
import { InvalidMessageError, LockedTopicError, validateMessageFields } from "@/domain/message/validate";

export { InvalidMessageError, LockedTopicError };

export interface PostMessageInput {
  boardId: string;
  parentId: string | null;
  authorId: string;
  subject: string;
  content: string;
}

/** Mirrors Message's validates_presence_of :subject/:content and cannot_reply_to_locked_topic. */
export async function postMessage(repositories: { messageRepository: MessageRepository }, input: PostMessageInput): Promise<Message> {
  validateMessageFields(input.subject, input.content);

  if (input.parentId) {
    const root = await repositories.messageRepository.findById(input.parentId);
    if (!root || root.boardId !== input.boardId) {
      throw new InvalidMessageError("返信先のトピックが見つかりません。");
    }
    if (root.locked) {
      throw new LockedTopicError("このトピックはロックされています。");
    }
  }

  const message = await repositories.messageRepository.create({
    boardId: input.boardId,
    parentId: input.parentId,
    authorId: input.authorId,
    subject: input.subject,
    content: input.content,
    locked: false,
    sticky: false,
  });

  if (input.parentId) {
    await repositories.messageRepository.incrementRepliesCount(input.parentId);
  }

  return message;
}
