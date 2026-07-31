import { describe, expect, it, mock } from "bun:test";
import { createBoard, InvalidBoardError } from "./create-board";
import type { Board } from "@/domain/board/entity";
import type { BoardRepository } from "@/domain/board/repository";

function makeRepo(): BoardRepository {
  return {
    listByProject: mock(async () => []),
    findById: mock(async () => null),
    create: mock(async (board) => ({ ...board, id: "board-1" }) as Board),
  };
}

const baseInput = { projectId: "proj-1", name: "General", description: "General discussion" };

describe("createBoard", () => {
  it("creates a board with valid name/description", async () => {
    const boardRepository = makeRepo();
    const board = await createBoard({ boardRepository }, baseInput);
    expect(board.name).toBe("General");
  });

  it("rejects an empty name", async () => {
    const boardRepository = makeRepo();
    await expect(createBoard({ boardRepository }, { ...baseInput, name: "" })).rejects.toThrow(InvalidBoardError);
  });

  it("rejects a name longer than 30 characters", async () => {
    const boardRepository = makeRepo();
    await expect(createBoard({ boardRepository }, { ...baseInput, name: "a".repeat(31) })).rejects.toThrow(InvalidBoardError);
  });

  it("rejects an empty description", async () => {
    const boardRepository = makeRepo();
    await expect(createBoard({ boardRepository }, { ...baseInput, description: "" })).rejects.toThrow(InvalidBoardError);
  });

  it("rejects a description longer than 255 characters", async () => {
    const boardRepository = makeRepo();
    await expect(createBoard({ boardRepository }, { ...baseInput, description: "a".repeat(256) })).rejects.toThrow(InvalidBoardError);
  });
});
