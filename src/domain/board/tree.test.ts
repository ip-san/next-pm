import { describe, expect, it } from "bun:test";
import type { Board } from "./entity";
import { boardTree, repositionSiblings, selfAndDescendantIds, validParents } from "./tree";

function board(id: string, parentId: string | null, position: number): Board {
  return { id, projectId: "p1", parentId, name: id, description: "", position };
}

describe("boardTree", () => {
  it("walks depth-first with siblings ordered by position", () => {
    const boards = [board("b", null, 2), board("a", null, 1), board("a2", "a", 2), board("a1", "a", 1), board("a1x", "a1", 1)];

    expect(boardTree(boards).map((node) => [node.board.id, node.level])).toEqual([
      ["a", 0],
      ["a1", 1],
      ["a1x", 2],
      ["a2", 1],
      ["b", 0],
    ]);
  });
});

describe("selfAndDescendantIds", () => {
  it("includes the board and everything below it", () => {
    const boards = [board("a", null, 1), board("a1", "a", 1), board("a1x", "a1", 1), board("b", null, 2)];
    expect([...selfAndDescendantIds(boards, "a")].sort()).toEqual(["a", "a1", "a1x"]);
  });
});

describe("validParents", () => {
  it("excludes the board itself and its descendants so the tree cannot cycle", () => {
    const boards = [board("a", null, 1), board("a1", "a", 1), board("b", null, 2)];
    expect(validParents(boards, "a").map((b) => b.id)).toEqual(["b"]);
  });
});

describe("repositionSiblings", () => {
  const siblings = [board("a", null, 1), board("b", null, 2), board("c", null, 3)];

  it("moves a board down and renumbers densely", () => {
    expect(repositionSiblings(siblings, "a", 3)).toEqual([
      { id: "b", position: 1 },
      { id: "c", position: 2 },
      { id: "a", position: 3 },
    ]);
  });

  it("moves a board up", () => {
    expect(repositionSiblings(siblings, "c", 1)).toEqual([
      { id: "c", position: 1 },
      { id: "a", position: 2 },
      { id: "b", position: 3 },
    ]);
  });

  it("clamps a position outside the list instead of leaving a gap", () => {
    expect(repositionSiblings(siblings, "a", 99)).toEqual([
      { id: "b", position: 1 },
      { id: "c", position: 2 },
      { id: "a", position: 3 },
    ]);
  });
});
