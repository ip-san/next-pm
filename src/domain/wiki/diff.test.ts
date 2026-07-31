import { describe, expect, it } from "bun:test";
import { diffLines } from "./diff";

describe("diffLines", () => {
  it("returns all-same lines for identical text", () => {
    const result = diffLines("a\nb\nc", "a\nb\nc");
    expect(result).toEqual([
      { kind: "same", text: "a" },
      { kind: "same", text: "b" },
      { kind: "same", text: "c" },
    ]);
  });

  it("detects a single added line", () => {
    const result = diffLines("a\nc", "a\nb\nc");
    expect(result).toEqual([
      { kind: "same", text: "a" },
      { kind: "add", text: "b" },
      { kind: "same", text: "c" },
    ]);
  });

  it("detects a single removed line", () => {
    const result = diffLines("a\nb\nc", "a\nc");
    expect(result).toEqual([
      { kind: "same", text: "a" },
      { kind: "remove", text: "b" },
      { kind: "same", text: "c" },
    ]);
  });

  it("detects a replaced line as remove+add", () => {
    const result = diffLines("a\nb\nc", "a\nx\nc");
    expect(result).toEqual([
      { kind: "same", text: "a" },
      { kind: "remove", text: "b" },
      { kind: "add", text: "x" },
      { kind: "same", text: "c" },
    ]);
  });

  it("treats going from empty to non-empty as all additions", () => {
    expect(diffLines("", "a\nb")).toEqual([
      { kind: "add", text: "a" },
      { kind: "add", text: "b" },
    ]);
  });

  it("treats going from non-empty to empty as all removals", () => {
    expect(diffLines("a\nb", "")).toEqual([
      { kind: "remove", text: "a" },
      { kind: "remove", text: "b" },
    ]);
  });

  it("handles completely disjoint content as full replacement", () => {
    const result = diffLines("a\nb", "x\ny");
    expect(result.every((line) => line.kind !== "same")).toBe(true);
    expect(result.filter((l) => l.kind === "remove").map((l) => l.text)).toEqual(["a", "b"]);
    expect(result.filter((l) => l.kind === "add").map((l) => l.text)).toEqual(["x", "y"]);
  });
});
