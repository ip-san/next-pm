import { describe, expect, it, mock } from "bun:test";
import { deleteMessage } from "./delete-message";
import type { Attachment } from "@/domain/attachment/entity";
import type { AttachmentRepository, AttachmentStorage } from "@/domain/attachment/repository";
import type { Message } from "@/domain/message/entity";
import type { MessageRepository } from "@/domain/message/repository";

function message(id: string, parentId: string | null): Message {
  return {
    id,
    boardId: "board-1",
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

function makeRepos(replies: Message[], attachments: Attachment[]) {
  const listByContainers = mock(async (_type: string, ids: string[]) => attachments.filter((a) => ids.includes(a.containerId!)));
  const deleteAttachment = mock<(id: string) => Promise<void>>(async () => {});
  const deleteFile = mock<(key: string) => Promise<void>>(async () => {});
  const deleteRow = mock(async () => {});
  return {
    messageRepository: { listReplies: mock(async () => replies), delete: deleteRow } as unknown as MessageRepository,
    attachmentRepository: { listByContainers, delete: deleteAttachment } as unknown as AttachmentRepository,
    attachmentStorage: { delete: deleteFile } as unknown as AttachmentStorage,
    listByContainers,
    deleteAttachment,
    deleteFile,
    deleteRow,
  };
}

describe("deleteMessage", () => {
  it("removes the attachments of a topic and of every reply it takes with it", async () => {
    const repos = makeRepos([message("r1", "t1")], [attachment("a-topic", "t1"), attachment("a-reply", "r1")]);

    await deleteMessage(repos, message("t1", null));

    expect(repos.listByContainers).toHaveBeenCalledWith("Message", ["t1", "r1"]);
    expect(repos.deleteAttachment.mock.calls.map(([id]) => id).sort()).toEqual(["a-reply", "a-topic"]);
    expect(repos.deleteFile.mock.calls.map(([key]) => key).sort()).toEqual(["key-a-reply", "key-a-topic"]);
    expect(repos.deleteRow).toHaveBeenCalledWith("t1");
  });

  it("only looks at its own attachments when deleting a reply", async () => {
    const repos = makeRepos([], [attachment("a-reply", "r1")]);

    await deleteMessage(repos, message("r1", "t1"));

    expect(repos.listByContainers).toHaveBeenCalledWith("Message", ["r1"]);
    expect(repos.deleteAttachment).toHaveBeenCalledWith("a-reply");
    expect(repos.deleteRow).toHaveBeenCalledWith("r1");
  });
});
