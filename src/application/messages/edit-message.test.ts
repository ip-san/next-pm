import { describe, expect, it, mock } from "bun:test";
import { editMessage, InvalidMessageError } from "./edit-message";
import type { Board } from "@/domain/board/entity";
import type { BoardRepository } from "@/domain/board/repository";
import type { Message } from "@/domain/message/entity";
import type { MessageRepository } from "@/domain/message/repository";

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    boardId: "board-1",
    parentId: null,
    authorId: "user-1",
    subject: "Subject",
    content: "Content",
    locked: false,
    sticky: false,
    repliesCount: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function board(id: string, projectId: string): Board {
  return { id, projectId, parentId: null, name: id, description: "d", position: 1 };
}

function makeRepos(boards: Board[]) {
  const update = mock(async (id: string, changes: Record<string, unknown>) => ({ ...message({ id }), ...changes }) as Message);
  const moveThreadToBoard = mock(async () => {});
  const messageRepository = {
    update,
    moveThreadToBoard,
  } as unknown as MessageRepository;
  const boardRepository = {
    findById: mock(async (id: string) => boards.find((b) => b.id === id) ?? null),
  } as unknown as BoardRepository;
  return { messageRepository, boardRepository, update, moveThreadToBoard };
}

const base = { subject: "New subject", content: "New content", locked: true, sticky: true, boardId: "board-1" };

describe("editMessage", () => {
  it("applies locked/sticky for a topic when the actor holds edit_messages", async () => {
    const repos = makeRepos([board("board-1", "proj-1")]);
    await editMessage(repos, { ...base, message: message(), canEditAllMessages: true });
    expect(repos.update).toHaveBeenCalledWith("msg-1", { subject: "New subject", content: "New content", locked: true, sticky: true });
  });

  it("drops locked/sticky for an author editing under edit_own_messages", async () => {
    const repos = makeRepos([board("board-1", "proj-1")]);
    await editMessage(repos, { ...base, message: message(), canEditAllMessages: false });
    expect(repos.update).toHaveBeenCalledWith("msg-1", { subject: "New subject", content: "New content" });
  });

  it("never sets locked/sticky on a reply", async () => {
    const repos = makeRepos([board("board-1", "proj-1")]);
    await editMessage(repos, { ...base, message: message({ parentId: "root-1" }), canEditAllMessages: true });
    expect(repos.update).toHaveBeenCalledWith("msg-1", { subject: "New subject", content: "New content" });
  });

  it("moves the topic and its replies to another board of the same project", async () => {
    const repos = makeRepos([board("board-1", "proj-1"), board("board-2", "proj-1")]);
    const updated = await editMessage(repos, { ...base, boardId: "board-2", message: message(), canEditAllMessages: true });
    expect(repos.moveThreadToBoard).toHaveBeenCalledWith("msg-1", "board-2");
    expect(updated.boardId).toBe("board-2");
  });

  it("refuses a move into another project's board", async () => {
    const repos = makeRepos([board("board-1", "proj-1"), board("board-2", "proj-2")]);
    await expect(editMessage(repos, { ...base, boardId: "board-2", message: message(), canEditAllMessages: true })).rejects.toThrow(
      InvalidMessageError,
    );
  });

  it("writes nothing at all when the move target is rejected", async () => {
    const repos = makeRepos([board("board-1", "proj-1"), board("board-2", "proj-2")]);
    await expect(editMessage(repos, { ...base, boardId: "board-2", message: message(), canEditAllMessages: true })).rejects.toThrow(
      InvalidMessageError,
    );
    expect(repos.update).not.toHaveBeenCalled();
    expect(repos.moveThreadToBoard).not.toHaveBeenCalled();
  });

  it("refuses a move to a board id that does not exist", async () => {
    const repos = makeRepos([board("board-1", "proj-1")]);
    await expect(editMessage(repos, { ...base, boardId: "ghost", message: message(), canEditAllMessages: true })).rejects.toThrow(
      InvalidMessageError,
    );
    expect(repos.update).not.toHaveBeenCalled();
  });

  it("ignores a board change requested with only edit_own_messages", async () => {
    const repos = makeRepos([board("board-1", "proj-1"), board("board-2", "proj-1")]);
    await editMessage(repos, { ...base, boardId: "board-2", message: message(), canEditAllMessages: false });
    expect(repos.moveThreadToBoard).not.toHaveBeenCalled();
  });

  it("rejects an empty subject", async () => {
    const repos = makeRepos([board("board-1", "proj-1")]);
    await expect(editMessage(repos, { ...base, subject: "", message: message(), canEditAllMessages: true })).rejects.toThrow(InvalidMessageError);
  });
});
