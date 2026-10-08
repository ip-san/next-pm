import { describe, expect, it, mock } from "bun:test";
import { InvalidBoardError, reorderBoard } from "./reorder-board";
import type { Board } from "@/domain/board/entity";
import type { BoardRepository } from "@/domain/board/repository";

function board(id: string, parentId: string | null, position: number): Board {
  return { id, projectId: "proj-1", parentId, name: id, description: "d", position };
}

function makeRepo(boards: Board[]) {
  const applyPositions = mock(async () => {});
  return {
    repositories: {
      boardRepository: { listByProject: mock(async () => boards), applyPositions } as unknown as BoardRepository,
    },
    applyPositions,
  };
}

describe("reorderBoard", () => {
  it("renumbers only the board's own sibling set", async () => {
    const { repositories, applyPositions } = makeRepo([
      board("a", null, 1),
      board("b", null, 2),
      board("a1", "a", 1),
      board("a2", "a", 2),
    ]);

    await reorderBoard(repositories, { boardId: "a2", projectId: "proj-1", position: 1 });

    expect(applyPositions).toHaveBeenCalledWith([
      { id: "a2", position: 1 },
      { id: "a1", position: 2 },
    ]);
  });

  it("rejects a board from another project", async () => {
    const { repositories } = makeRepo([board("a", null, 1)]);
    await expect(reorderBoard(repositories, { boardId: "ghost", projectId: "proj-1", position: 1 })).rejects.toThrow(InvalidBoardError);
  });
});
