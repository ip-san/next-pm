import { describe, expect, it, mock } from "bun:test";
import { InvalidBoardError, updateBoard } from "./update-board";
import type { Board } from "@/domain/board/entity";
import type { BoardRepository } from "@/domain/board/repository";

function board(id: string, parentId: string | null, position: number): Board {
  return { id, projectId: "proj-1", parentId, name: id, description: "d", position };
}

function makeRepo(existing: Board[]) {
  const update = mock(async (id: string, changes: Record<string, unknown>) => ({ ...board(id, null, 1), ...changes }) as Board);
  const applyPositions = mock(async () => {});
  const boardRepository: BoardRepository = {
    listByProject: mock(async () => existing),
    findById: mock(async (id: string) => existing.find((b) => b.id === id) ?? null),
    create: mock(async () => ({}) as Board),
    update,
    delete: mock(async () => {}),
    applyPositions,
  };
  return { boardRepository, update, applyPositions };
}

const baseInput = { projectId: "proj-1", name: "Renamed", description: "d" };

describe("updateBoard", () => {
  it("renames a board without touching positions", async () => {
    const { boardRepository, update, applyPositions } = makeRepo([board("a", null, 1), board("b", null, 2)]);
    await updateBoard({ boardRepository }, { ...baseInput, boardId: "a", parentId: null });
    expect(update).toHaveBeenCalledWith("a", { name: "Renamed", description: "d" });
    expect(applyPositions).not.toHaveBeenCalled();
  });

  it("rejects a parent that is the board itself", async () => {
    const { boardRepository } = makeRepo([board("a", null, 1)]);
    await expect(updateBoard({ boardRepository }, { ...baseInput, boardId: "a", parentId: "a" })).rejects.toThrow(InvalidBoardError);
  });

  it("rejects a parent board from another project", async () => {
    // listByProject is scoped to this project, so a board belonging to another one is never
    // among the valid parents — the same rule createBoard applies, pinned here too since
    // re-parenting is the path an attacker would reach for.
    const { boardRepository } = makeRepo([board("a", null, 1)]);
    await expect(
      updateBoard({ boardRepository }, { ...baseInput, boardId: "a", parentId: "board-in-another-project" }),
    ).rejects.toThrow(InvalidBoardError);
  });

  it("rejects a parent that is one of the board's own descendants", async () => {
    const { boardRepository } = makeRepo([board("a", null, 1), board("a1", "a", 1), board("a1x", "a1", 1)]);
    await expect(updateBoard({ boardRepository }, { ...baseInput, boardId: "a", parentId: "a1x" })).rejects.toThrow(InvalidBoardError);
  });

  it("appends to the new sibling set and closes the gap in the old one", async () => {
    const { boardRepository, update, applyPositions } = makeRepo([
      board("a", null, 1),
      board("b", null, 2),
      board("c", null, 3),
      board("a1", "a", 1),
    ]);
    await updateBoard({ boardRepository }, { ...baseInput, boardId: "c", parentId: "a" });

    expect(update).toHaveBeenCalledWith("c", { name: "Renamed", description: "d", parentId: "a", position: 2 });
    expect(applyPositions).toHaveBeenCalledWith([
      { id: "a", position: 1 },
      { id: "b", position: 2 },
    ]);
  });
});
