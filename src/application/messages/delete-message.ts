import type { AttachmentRepository, AttachmentStorage } from "@/domain/attachment/repository";
import type { Message } from "@/domain/message/entity";
import type { MessageRepository } from "@/domain/message/repository";

/**
 * Mirrors MessagesController#destroy. Deleting a topic takes its replies with it
 * (`acts_as_tree`), which the messages.parent_id cascade already does in Postgres; the
 * attachments hanging off those rows are polymorphic and have no foreign key, so their rows
 * and files are removed here the way Rails' dependent-destroy chain would.
 */
export async function deleteMessage(
  repositories: {
    messageRepository: MessageRepository;
    attachmentRepository: AttachmentRepository;
    attachmentStorage: AttachmentStorage;
  },
  message: Message,
): Promise<void> {
  const replies = message.parentId === null ? await repositories.messageRepository.listReplies(message.id) : [];
  const attachments = await repositories.attachmentRepository.listByContainers("Message", [message.id, ...replies.map((reply) => reply.id)]);
  for (const attachment of attachments) {
    await repositories.attachmentRepository.delete(attachment.id);
    await repositories.attachmentStorage.delete(attachment.storageKey);
  }

  await repositories.messageRepository.delete(message.id);
}
