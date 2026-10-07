import { describe, expect, it } from "bun:test";
import { moveToPosition, nextPosition, resolveMove } from "./positioned";

const list = [
  { id: "a", position: 1 },
  { id: "b", position: 2 },
  { id: "c", position: 3 },
  { id: "d", position: 4 },
];

describe("moveToPosition", () => {
  it("shifts the rows between the old and the new slot", () => {
    expect(moveToPosition(list, "d", 2)).toEqual([
      { id: "d", position: 2 },
      { id: "b", position: 3 },
      { id: "c", position: 4 },
    ]);
  });

  it("reports nothing when the row is already at the target position", () => {
    expect(moveToPosition(list, "b", 2)).toEqual([]);
  });

  it("clamps a target beyond the list to its ends", () => {
    expect(moveToPosition(list, "a", 99)).toEqual([
      { id: "b", position: 1 },
      { id: "c", position: 2 },
      { id: "d", position: 3 },
      { id: "a", position: 4 },
    ]);
  });

  it("renumbers a list whose rows all share position 0 (every admin create inserts 0)", () => {
    const unpositioned = [
      { id: "a", position: 0 },
      { id: "b", position: 0 },
      { id: "c", position: 0 },
    ];
    // Ties break on id, so the list reads a, b, c before the move.
    expect(moveToPosition(unpositioned, "c", 1)).toEqual([
      { id: "c", position: 1 },
      { id: "a", position: 2 },
      { id: "b", position: 3 },
    ]);
  });

  it("ignores an id that isn't in the list", () => {
    expect(moveToPosition(list, "zz", 1)).toEqual([]);
  });
});

describe("resolveMove", () => {
  it("moves one slot up for \"higher\"", () => {
    expect(resolveMove(list, "c", "higher")).toEqual([
      { id: "c", position: 2 },
      { id: "b", position: 3 },
    ]);
  });

  it("moves one slot down for \"lower\"", () => {
    expect(resolveMove(list, "b", "lower")).toEqual([
      { id: "c", position: 2 },
      { id: "b", position: 3 },
    ]);
  });

  it("moves to the ends for \"highest\" / \"lowest\"", () => {
    expect(resolveMove(list, "d", "highest")).toEqual([
      { id: "d", position: 1 },
      { id: "a", position: 2 },
      { id: "b", position: 3 },
      { id: "c", position: 4 },
    ]);
    expect(resolveMove(list, "a", "lowest")).toEqual([
      { id: "b", position: 1 },
      { id: "c", position: 2 },
      { id: "d", position: 3 },
      { id: "a", position: 4 },
    ]);
  });

  it("does nothing at the edges of the list", () => {
    expect(resolveMove(list, "a", "higher")).toEqual([]);
    expect(resolveMove(list, "d", "lower")).toEqual([]);
  });
});

describe("nextPosition", () => {
  it("appends after the current maximum", () => {
    expect(nextPosition(list)).toBe(5);
  });

  it("starts at 1 for an empty list", () => {
    expect(nextPosition([])).toBe(1);
  });
});
