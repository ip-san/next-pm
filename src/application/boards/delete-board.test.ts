import { describe, expect, it, mock } from "bun:test";
import { deleteBoard } from "./delete-board";
import type { Attachment } from "@/domain/attachment/entity";
import type { AttachmentRepository, AttachmentStorage } from "@/domain/attachment/repository";
import type { Board } from "@/domain/board/entity";
import type { BoardRepository } from "@/domain/board/repository";
import type { Message } from "@/domain/message/entity";
import type { MessageRepository } from "@/domain/message/repository";

function board(id: string, parentId: string | null, position: number): Board {
  return { id, projectId: "proj-1", parentId, name: id, description: "d", position };
}

function message(id: string, parentId: string | null): Message {
  return {
    id,
    boardId: "b",
    parentId,
    authorId: "u1",
    subject: "s",
    content: "c",
    locked: false,
    sticky: false,
    repliesCount: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function attachment(id: string, containerId: string): Attachment {
  return {
    id,
    containerType: "Message",
    containerId,
    authorId: "u1",
    filename: `${id}.txt`,
    storageKey: `key-${id}`,
    contentType: "text/plain",
    fileSize: 1,
    digest: "d",
    description: "",
    downloads: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function makeRepos(boards: Board[], topics: Message[], replies: Record<string, Message[]>, attachments: Attachment[]) {
  const deleteBoardRow = mock(async () => {});
  const applyPositions = mock(async () => {});
  const deleteAttachment = mock<(id: string) => Promise<void>>(async () => {});
  const deleteFile = mock<(key: string) => Promise<void>>(async () => {});
  const listByContainers = mock(async (_type: string, ids: string[]) => attachments.filter((a) => ids.includes(a.containerId!)));

  return {
    boardRepository: {
      listByProject: mock(async () => boards),
      delete: deleteBoardRow,
      applyPositions,
    } as unknown as BoardRepository,
    messageRepository: {
      listTopicsByBoard: mock(async () => topics),
      listReplies: mock(async (parentId: string) => replies[parentId] ?? []),
    } as unknown as MessageRepository,
    attachmentRepository: { listByContainers, delete: deleteAttachment } as unknown as AttachmentRepository,
    attachmentStorage: { delete: deleteFile } as unknown as AttachmentStorage,
    deleteBoardRow,
    applyPositions,
    deleteAttachment,
    deleteFile,
    listByContainers,
  };
}

describe("deleteBoard", () => {
  it("sweeps the attachments of the board's topics and their replies", async () => {
    const repos = makeRepos(
      [board("a", null, 1)],
      [message("t1", null)],
      { t1: [message("r1", "t1")] },
      [attachment("att-topic", "t1"), attachment("att-reply", "r1"), attachment("att-elsewhere", "other")],
    );

    await deleteBoard(repos, { boardId: "a", projectId: "proj-1" });

    expect(repos.listByContainers).toHaveBeenCalledWith("Message", ["t1", "r1"]);
    expect(repos.deleteAttachment.mock.calls.map(([id]) => id).sort()).toEqual(["att-reply", "att-topic"]);
    expect(repos.deleteFile.mock.calls.map(([key]) => key).sort()).toEqual(["key-att-reply", "key-att-topic"]);
    expect(repos.deleteBoardRow).toHaveBeenCalledWith("a");
  });

  it("closes the gap left in its own sibling set and leaves other parents alone", async () => {
    const repos = makeRepos(
      [board("a", null, 1), board("b", null, 2), board("c", null, 3), board("a1", "a", 1), board("a2", "a", 2)],
      [],
      {},
      [],
    );

    await deleteBoard(repos, { boardId: "b", projectId: "proj-1" });

    // Only the top-level siblings are renumbered; a's children keep their own numbering.
    expect(repos.applyPositions).toHaveBeenCalledWith([
      { id: "a", position: 1 },
      { id: "c", position: 2 },
    ]);
  });

  it("does nothing when the board is not in the project", async () => {
    const repos = makeRepos([board("a", null, 1)], [], {}, []);
    await deleteBoard(repos, { boardId: "ghost", projectId: "proj-1" });
    expect(repos.deleteBoardRow).not.toHaveBeenCalled();
    expect(repos.applyPositions).not.toHaveBeenCalled();
  });
});
