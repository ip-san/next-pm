import { describe, expect, it } from "bun:test";
import { addBlock, findBlockGroup, moveBlockToGroup, moveBlockWithinGroup, removeBlock } from "./layout";
import type { MyPageLayout } from "./entity";

const BASE: MyPageLayout = { top: [], left: ["issues_assigned_to_me", "issues_watched"], right: ["news"] };

describe("addBlock", () => {
  it("unshifts the block onto the top group", () => {
    const next = addBlock(BASE, "documents");
    expect(next.top).toEqual(["documents"]);
    expect(next.left).toEqual(BASE.left);
    expect(next.right).toEqual(BASE.right);
  });

  it("moves an already-placed block to top rather than duplicating it", () => {
    const next = addBlock(BASE, "news");
    expect(next.top).toEqual(["news"]);
    expect(next.right).toEqual([]);
  });
});

describe("removeBlock", () => {
  it("removes the block from whichever group holds it", () => {
    const next = removeBlock(BASE, "issues_watched");
    expect(next.left).toEqual(["issues_assigned_to_me"]);
  });

  it("is a no-op if the block isn't placed anywhere", () => {
    const next = removeBlock(BASE, "timelog");
    expect(next).toEqual(BASE);
  });
});

describe("moveBlockWithinGroup", () => {
  it("swaps with the previous block when moving up", () => {
    const next = moveBlockWithinGroup(BASE, "left", "issues_watched", "up");
    expect(next.left).toEqual(["issues_watched", "issues_assigned_to_me"]);
  });

  it("swaps with the next block when moving down", () => {
    const next = moveBlockWithinGroup(BASE, "left", "issues_assigned_to_me", "down");
    expect(next.left).toEqual(["issues_watched", "issues_assigned_to_me"]);
  });

  it("is a no-op when already at the top of the group and moving up", () => {
    const next = moveBlockWithinGroup(BASE, "left", "issues_assigned_to_me", "up");
    expect(next).toBe(BASE);
  });

  it("is a no-op when already at the bottom of the group and moving down", () => {
    const next = moveBlockWithinGroup(BASE, "left", "issues_watched", "down");
    expect(next).toBe(BASE);
  });

  it("is a no-op when the block isn't in that group", () => {
    const next = moveBlockWithinGroup(BASE, "right", "issues_watched", "up");
    expect(next).toBe(BASE);
  });
});

describe("moveBlockToGroup", () => {
  it("moves the block out of its current group and appends it to the target group", () => {
    const next = moveBlockToGroup(BASE, "issues_watched", "right");
    expect(next.left).toEqual(["issues_assigned_to_me"]);
    expect(next.right).toEqual(["news", "issues_watched"]);
  });
});

describe("findBlockGroup", () => {
  it("finds the group containing a placed block", () => {
    expect(findBlockGroup(BASE, "news")).toBe("right");
  });

  it("returns null for a block that isn't placed anywhere", () => {
    expect(findBlockGroup(BASE, "documents")).toBeNull();
  });
});
