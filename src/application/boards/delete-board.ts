import type { AttachmentRepository, AttachmentStorage } from "@/domain/attachment/repository";
import type { BoardRepository } from "@/domain/board/repository";
import type { MessageRepository } from "@/domain/message/repository";

export interface DeleteBoardInput {
  boardId: string;
  projectId: string;
}

/**
 * Mirrors BoardsController#destroy: `has_many :messages, :dependent => :destroy` takes the
 * board's topics and replies with it, while `acts_as_tree :dependent => :nullify` promotes
 * child boards to the project's top level instead of deleting them.
 *
 * The message rows go through the boards -> messages cascade in Postgres; their attachments
 * do not (attachments.container_id is polymorphic and carries no foreign key), so the files
 * are removed here, the way Rails' dependent-destroy chain would.
 */
export async function deleteBoard(
  repositories: {
    boardRepository: BoardRepository;
    messageRepository: MessageRepository;
    attachmentRepository: AttachmentRepository;
    attachmentStorage: AttachmentStorage;
  },
  input: DeleteBoardInput,
): Promise<void> {
  const projectBoards = await repositories.boardRepository.listByProject(input.projectId);
  const board = projectBoards.find((candidate) => candidate.id === input.boardId);
  if (!board) return;

  const topics = await repositories.messageRepository.listTopicsByBoard(board.id);
  const replies = (await Promise.all(topics.map((topic) => repositories.messageRepository.listReplies(topic.id)))).flat();
  const attachments = await repositories.attachmentRepository.listByContainers("Message", [...topics, ...replies].map((message) => message.id));
  for (const attachment of attachments) {
    await repositories.attachmentRepository.delete(attachment.id);
    await repositories.attachmentStorage.delete(attachment.storageKey);
  }

  await repositories.boardRepository.delete(board.id);

  // acts_as_positioned#remove_position: the sibling set the board left closes its gap.
  await repositories.boardRepository.applyPositions(
    projectBoards
      .filter((candidate) => candidate.parentId === board.parentId && candidate.id !== board.id)
      .sort((a, b) => a.position - b.position)
      .map((candidate, index) => ({ id: candidate.id, position: index + 1 })),
  );
}
