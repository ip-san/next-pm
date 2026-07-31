import { describe, expect, it } from "bun:test";
import { normalizeRelation } from "./normalize";

describe("normalizeRelation", () => {
  it("stores a plain relates as-is when issueFromId < issueToId", () => {
    expect(
      normalizeRelation({ issueFromId: "a", issueToId: "b", relationType: "relates", delay: null }),
    ).toEqual({ issueFromId: "a", issueToId: "b", relationType: "relates", delay: null });
  });

  it("swaps a relates pair so the lower id is always issueFromId", () => {
    expect(
      normalizeRelation({ issueFromId: "b", issueToId: "a", relationType: "relates", delay: null }),
    ).toEqual({ issueFromId: "a", issueToId: "b", relationType: "relates", delay: null });
  });

  it("rewrites 'duplicated' to canonical 'duplicates' with from/to swapped", () => {
    // "A is duplicated by B" is stored as "B duplicates A"
    expect(
      normalizeRelation({ issueFromId: "a", issueToId: "b", relationType: "duplicated", delay: null }),
    ).toEqual({ issueFromId: "b", issueToId: "a", relationType: "duplicates", delay: null });
  });

  it("rewrites 'blocked' to canonical 'blocks' with from/to swapped", () => {
    expect(
      normalizeRelation({ issueFromId: "a", issueToId: "b", relationType: "blocked", delay: null }),
    ).toEqual({ issueFromId: "b", issueToId: "a", relationType: "blocks", delay: null });
  });

  it("rewrites 'follows' to canonical 'precedes', defaulting delay to 0", () => {
    expect(
      normalizeRelation({ issueFromId: "a", issueToId: "b", relationType: "follows", delay: null }),
    ).toEqual({ issueFromId: "b", issueToId: "a", relationType: "precedes", delay: 0 });
  });

  it("rewrites 'copied_from' to canonical 'copied_to' with from/to swapped", () => {
    expect(
      normalizeRelation({ issueFromId: "a", issueToId: "b", relationType: "copied_from", delay: null }),
    ).toEqual({ issueFromId: "b", issueToId: "a", relationType: "copied_to", delay: null });
  });

  it("preserves an explicit delay for a canonical 'precedes' input", () => {
    expect(
      normalizeRelation({ issueFromId: "a", issueToId: "b", relationType: "precedes", delay: 3 }),
    ).toEqual({ issueFromId: "a", issueToId: "b", relationType: "precedes", delay: 3 });
  });

  it("clears delay to null for non-precedes canonical types", () => {
    expect(
      normalizeRelation({ issueFromId: "a", issueToId: "b", relationType: "blocks", delay: 5 }),
    ).toEqual({ issueFromId: "a", issueToId: "b", relationType: "blocks", delay: null });
  });
});
