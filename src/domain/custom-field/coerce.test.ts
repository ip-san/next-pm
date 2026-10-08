import { describe, expect, it } from "bun:test";
import { coerceCustomFieldValue } from "./coerce";
import type { CustomField } from "./entity";

function field(overrides: Partial<Pick<CustomField, "name" | "fieldFormat" | "isRequired" | "possibleValues">> = {}) {
  return { name: "Test Field", fieldFormat: "string" as const, isRequired: false, possibleValues: [], ...overrides };
}

describe("coerceCustomFieldValue", () => {
  it("passes a string value through unchanged", () => {
    expect(coerceCustomFieldValue(field({ fieldFormat: "string" }), "hello")).toEqual({ ok: true, value: "hello" });
  });

  it("rejects an empty value on a required field", () => {
    expect(coerceCustomFieldValue(field({ isRequired: true }), "  ")).toEqual({
      ok: false,
      error: expect.stringContaining("必須"),
    });
  });

  it("keeps a link value as typed, since the href is built when it is shown", () => {
    expect(coerceCustomFieldValue(field({ fieldFormat: "link" }), "example.com/docs")).toEqual({ ok: true, value: "example.com/docs" });
  });

  it("accepts an empty value on an optional field, normalizing to null", () => {
    expect(coerceCustomFieldValue(field({ isRequired: false }), "")).toEqual({ ok: true, value: null });
  });

  it("accepts a valid integer", () => {
    expect(coerceCustomFieldValue(field({ fieldFormat: "int" }), "42")).toEqual({ ok: true, value: "42" });
  });

  it("rejects a non-integer for the int format", () => {
    expect(coerceCustomFieldValue(field({ fieldFormat: "int" }), "4.2").ok).toBe(false);
  });

  it("accepts a valid float", () => {
    expect(coerceCustomFieldValue(field({ fieldFormat: "float" }), "4.2")).toEqual({ ok: true, value: "4.2" });
  });

  it("accepts a valid ISO date", () => {
    expect(coerceCustomFieldValue(field({ fieldFormat: "date" }), "2026-07-31")).toEqual({
      ok: true,
      value: "2026-07-31",
    });
  });

  it("rejects a malformed date", () => {
    expect(coerceCustomFieldValue(field({ fieldFormat: "date" }), "31/07/2026").ok).toBe(false);
  });

  it("accepts bool values 0 and 1 only", () => {
    expect(coerceCustomFieldValue(field({ fieldFormat: "bool" }), "1")).toEqual({ ok: true, value: "1" });
    expect(coerceCustomFieldValue(field({ fieldFormat: "bool" }), "true").ok).toBe(false);
  });

  it("accepts a list value that is in possibleValues", () => {
    expect(coerceCustomFieldValue(field({ fieldFormat: "list", possibleValues: ["A", "B"] }), "A")).toEqual({
      ok: true,
      value: "A",
    });
  });

  it("rejects a list value that is not in possibleValues", () => {
    expect(coerceCustomFieldValue(field({ fieldFormat: "list", possibleValues: ["A", "B"] }), "C").ok).toBe(false);
  });
});

describe("coerceCustomFieldValue for user and version fields", () => {
  const member = "3f1c2b5e-9a7d-4e8f-8b6a-1d2c3e4f5a6b";
  const outsider = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";

  it("accepts a record id the project offers", () => {
    expect(coerceCustomFieldValue(field({ fieldFormat: "user" }), member, new Set([member]))).toEqual({ ok: true, value: member });
  });

  it("refuses an id the project does not offer", () => {
    expect(coerceCustomFieldValue(field({ fieldFormat: "version" }), outsider, new Set([member]))).toEqual({
      ok: false,
      error: expect.stringContaining("候補"),
    });
  });

  it("refuses everything when no options are known (fail closed)", () => {
    expect(coerceCustomFieldValue(field({ fieldFormat: "user" }), member).ok).toBe(false);
  });

  it("refuses a value that is not an id at all", () => {
    expect(coerceCustomFieldValue(field({ fieldFormat: "user" }), "Dev One", new Set(["Dev One"])).ok).toBe(false);
  });
});

describe("coerceCustomFieldValue for enumeration fields", () => {
  const choice = "5d6e7f80-1a2b-4c3d-8e4f-0a1b2c3d4e5f";

  it("accepts an active choice id the field offers", () => {
    expect(coerceCustomFieldValue(field({ fieldFormat: "enumeration" }), choice, new Set([choice]))).toEqual({ ok: true, value: choice });
  });

  it("refuses the name of a choice, since the value stores the id", () => {
    expect(coerceCustomFieldValue(field({ fieldFormat: "enumeration" }), "Low", new Set([choice])).ok).toBe(false);
  });
});
