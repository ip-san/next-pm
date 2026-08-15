import { describe, expect, it, mock } from "bun:test";
import { toggleReaction } from "./toggle-reaction";
import type { Reaction } from "@/domain/reaction/entity";
import type { ReactionRepository } from "@/domain/reaction/repository";

function makeRepo(existing: Reaction[]) {
  const react = mock(async (reactableType: string, reactableId: string, userId: string) => {
    existing.push({ id: "new", reactableType: reactableType as "Journal", reactableId, userId, createdAt: new Date() });
  });
  const unreact = mock(async (reactableType: string, reactableId: string, userId: string) => {
    const index = existing.findIndex((r) => r.reactableType === reactableType && r.reactableId === reactableId && r.userId === userId);
    if (index !== -1) existing.splice(index, 1);
  });
  const reactionRepository: ReactionRepository = {
    hasReacted: mock(async (reactableType, reactableId, userId) =>
      existing.some((r) => r.reactableType === reactableType && r.reactableId === reactableId && r.userId === userId),
    ),
    react,
    unreact,
    listForReactables: mock(async () => existing),
  };
  return { reactionRepository, react, unreact };
}

describe("toggleReaction", () => {
  it("adds a reaction when the user hasn't reacted yet", async () => {
    const { reactionRepository, react } = makeRepo([]);
    const result = await toggleReaction({ reactionRepository }, "Journal", "journal-1", "user-1");
    expect(result.reacted).toBe(true);
    expect(react).toHaveBeenCalledWith("Journal", "journal-1", "user-1");
  });

  it("removes the reaction when the user already reacted", async () => {
    const existing: Reaction[] = [{ id: "r1", reactableType: "Journal", reactableId: "journal-1", userId: "user-1", createdAt: new Date() }];
    const { reactionRepository, unreact } = makeRepo(existing);
    const result = await toggleReaction({ reactionRepository }, "Journal", "journal-1", "user-1");
    expect(result.reacted).toBe(false);
    expect(unreact).toHaveBeenCalledWith("Journal", "journal-1", "user-1");
  });

  it("doesn't affect another user's reaction on the same journal", async () => {
    const existing: Reaction[] = [{ id: "r1", reactableType: "Journal", reactableId: "journal-1", userId: "other-user", createdAt: new Date() }];
    const { reactionRepository } = makeRepo(existing);
    const result = await toggleReaction({ reactionRepository }, "Journal", "journal-1", "user-1");
    expect(result.reacted).toBe(true);
    expect(existing.some((r) => r.userId === "other-user")).toBe(true);
  });
});
