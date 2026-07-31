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
