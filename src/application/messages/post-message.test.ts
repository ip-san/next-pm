import { describe, expect, it, mock } from "bun:test";
import { InvalidMessageError, LockedTopicError, postMessage } from "./post-message";
import type { Message } from "@/domain/message/entity";
import type { MessageRepository } from "@/domain/message/repository";

function makeRepo(overrides: Partial<MessageRepository> = {}): MessageRepository {
  return {
    findById: mock(async () => null),
    listTopicsByBoard: mock(async () => []),
    listReplies: mock(async () => []),
    create: mock(async (message) => ({ ...message, id: "msg-1", repliesCount: 0, createdAt: new Date() }) as Message),
    update: mock(async (id, changes) => ({ id, boardId: "board-1", parentId: null, authorId: "u1", subject: "s", content: "c", locked: false, sticky: false, repliesCount: 0, createdAt: new Date(), ...changes }) as Message),
    delete: mock(async () => {}),
    incrementRepliesCount: mock(async () => {}),
    search: mock(async () => []),
    ...overrides,
  };
}

const baseTopicInput = { boardId: "board-1", parentId: null, authorId: "user-1", subject: "Hello", content: "World" };

describe("postMessage", () => {
  it("creates a new topic", async () => {
    const messageRepository = makeRepo();
    const message = await postMessage({ messageRepository }, baseTopicInput);
    expect(message.subject).toBe("Hello");
    expect(messageRepository.incrementRepliesCount).not.toHaveBeenCalled();
  });

  it("rejects an empty subject", async () => {
    const messageRepository = makeRepo();
    await expect(postMessage({ messageRepository }, { ...baseTopicInput, subject: "" })).rejects.toThrow(InvalidMessageError);
  });

  it("rejects an empty content", async () => {
    const messageRepository = makeRepo();
    await expect(postMessage({ messageRepository }, { ...baseTopicInput, content: "" })).rejects.toThrow(InvalidMessageError);
  });

  it("posts a reply and increments the parent's replies count", async () => {
    const root: Message = { id: "root-1", boardId: "board-1", parentId: null, authorId: "u1", subject: "Root", content: "c", locked: false, sticky: false, repliesCount: 0, createdAt: new Date() };
    const messageRepository = makeRepo({ findById: mock(async () => root) });
    await postMessage({ messageRepository }, { ...baseTopicInput, parentId: "root-1" });
    expect(messageRepository.incrementRepliesCount).toHaveBeenCalledWith("root-1");
  });

  it("rejects a reply to a nonexistent topic", async () => {
    const messageRepository = makeRepo({ findById: mock(async () => null) });
    await expect(postMessage({ messageRepository }, { ...baseTopicInput, parentId: "missing" })).rejects.toThrow(InvalidMessageError);
  });

  it("rejects a reply to a locked topic", async () => {
    const lockedRoot: Message = { id: "root-1", boardId: "board-1", parentId: null, authorId: "u1", subject: "Root", content: "c", locked: true, sticky: false, repliesCount: 0, createdAt: new Date() };
    const messageRepository = makeRepo({ findById: mock(async () => lockedRoot) });
    await expect(postMessage({ messageRepository }, { ...baseTopicInput, parentId: "root-1" })).rejects.toThrow(LockedTopicError);
  });

  it("rejects a reply whose parent topic belongs to a different board", async () => {
    const rootOnOtherBoard: Message = { id: "root-1", boardId: "other-board", parentId: null, authorId: "u1", subject: "Root", content: "c", locked: false, sticky: false, repliesCount: 0, createdAt: new Date() };
    const messageRepository = makeRepo({ findById: mock(async () => rootOnOtherBoard) });
    await expect(postMessage({ messageRepository }, { ...baseTopicInput, boardId: "board-1", parentId: "root-1" })).rejects.toThrow(InvalidMessageError);
    expect(messageRepository.create).not.toHaveBeenCalled();
  });
});
