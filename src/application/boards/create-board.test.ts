import { describe, expect, it, mock } from "bun:test";
import { createBoard, InvalidBoardError } from "./create-board";
import type { Board } from "@/domain/board/entity";
import type { BoardRepository } from "@/domain/board/repository";

function makeRepo(existing: Board[] = []): BoardRepository {
  return {
    listByProject: mock(async () => existing),
    findById: mock(async () => null),
    create: mock(async (board) => ({ ...board, id: "board-1" }) as Board),
    update: mock(async () => ({}) as Board),
    delete: mock(async () => {}),
    applyPositions: mock(async () => {}),
  };
}

const baseInput = { projectId: "proj-1", parentId: null, name: "General", description: "General discussion" };

function board(id: string, parentId: string | null, position: number): Board {
  return { id, projectId: "proj-1", parentId, name: id, description: "d", position };
}

describe("createBoard", () => {
  it("creates a board with valid name/description", async () => {
    const boardRepository = makeRepo();
    const board = await createBoard({ boardRepository }, baseInput);
    expect(board.name).toBe("General");
  });

  it("appends the board to the end of its sibling set", async () => {
    const boardRepository = makeRepo([board("a", null, 1), board("b", null, 2), board("c", "a", 1)]);
    const created = await createBoard({ boardRepository }, baseInput);
    expect(created.position).toBe(3);
  });

  it("numbers the first board of a parent from 1", async () => {
    const boardRepository = makeRepo([board("a", null, 1), board("b", null, 2)]);
    const created = await createBoard({ boardRepository }, { ...baseInput, parentId: "a" });
    expect(created.position).toBe(1);
  });

  it("rejects a parent board from another project", async () => {
    const boardRepository = makeRepo([board("a", null, 1)]);
    await expect(createBoard({ boardRepository }, { ...baseInput, parentId: "other" })).rejects.toThrow(InvalidBoardError);
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
