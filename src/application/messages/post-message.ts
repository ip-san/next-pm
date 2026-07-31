import type { Message } from "@/domain/message/entity";
import type { MessageRepository } from "@/domain/message/repository";

export class InvalidMessageError extends Error {}
export class LockedTopicError extends Error {}

export interface PostMessageInput {
  boardId: string;
  parentId: string | null;
  authorId: string;
  subject: string;
  content: string;
}

/** Mirrors Message's validates_presence_of :subject/:content and cannot_reply_to_locked_topic. */
export async function postMessage(repositories: { messageRepository: MessageRepository }, input: PostMessageInput): Promise<Message> {
  if (input.subject.trim().length === 0 || input.subject.length > 255) {
    throw new InvalidMessageError("件名は1〜255文字で入力してください。");
  }
  if (input.content.trim().length === 0) {
    throw new InvalidMessageError("本文を入力してください。");
  }

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
