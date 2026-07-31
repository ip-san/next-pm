import { describe, expect, it } from "bun:test";
import { compileFilters } from "./filter-builder";

describe("compileFilters", () => {
  it("compiles equals and not-equals", () => {
    expect(compileFilters([{ field: "status_id", operator: "=", values: ["new"] }])).toEqual([
      { field: "status_id", kind: "eq", values: ["new"] },
    ]);
    expect(compileFilters([{ field: "status_id", operator: "!", values: ["closed"] }])).toEqual([
      { field: "status_id", kind: "neq", values: ["closed"] },
    ]);
  });

  it("compiles is-empty and is-not-empty without needing values", () => {
    expect(compileFilters([{ field: "assigned_to_id", operator: "!*", values: [] }])).toEqual([
      { field: "assigned_to_id", kind: "isNull", values: [] },
    ]);
    expect(compileFilters([{ field: "assigned_to_id", operator: "*", values: [] }])).toEqual([
      { field: "assigned_to_id", kind: "isNotNull", values: [] },
    ]);
  });

  it("compiles numeric range operators", () => {
    expect(compileFilters([{ field: "done_ratio", operator: ">=", values: ["50"] }])).toEqual([
      { field: "done_ratio", kind: "gte", values: ["50"] },
    ]);
    expect(compileFilters([{ field: "done_ratio", operator: "><", values: ["10", "90"] }])).toEqual([
      { field: "done_ratio", kind: "between", values: ["10", "90"] },
    ]);
  });

  it("compiles text contains/not-contains", () => {
    expect(compileFilters([{ field: "subject", operator: "~", values: ["bug"] }])).toEqual([
      { field: "subject", kind: "contains", values: ["bug"] },
    ]);
  });

  it("compiles multiple conditions independently, preserving order", () => {
    const compiled = compileFilters([
      { field: "status_id", operator: "=", values: ["new"] },
      { field: "priority_id", operator: "=", values: ["high"] },
    ]);
    expect(compiled.map((c) => c.field)).toEqual(["status_id", "priority_id"]);
  });

  it("throws when a range operator is missing its required value", () => {
    expect(() => compileFilters([{ field: "done_ratio", operator: ">=", values: [] }])).toThrow(/missing value/);
  });
});
