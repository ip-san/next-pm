import { describe, expect, it } from "bun:test";
import { sameCustomValue, storedRowsFor, valueFromStoredRows } from "./storage";

describe("single-valued fields", () => {
  it("round-trips a multi-line text value byte for byte", () => {
    const text = "step 2\n\nstep 1\nbeta\nalpha";
    expect(valueFromStoredRows(storedRowsFor(false, text))).toBe(text);
  });

  it("clears on an empty value", () => {
    expect(storedRowsFor(false, "")).toEqual([]);
    expect(storedRowsFor(false, null)).toEqual([]);
  });
});

describe("multiple-valued fields", () => {
  it("keeps one row per value, dropping blank lines", () => {
    expect(storedRowsFor(true, "Red\n\nBlue")).toEqual(["Red", "Blue"]);
  });

  it("reads several rows back joined one per line", () => {
    expect(valueFromStoredRows(["Blue", "Red"])).toBe("Blue\nRed");
  });
});

describe("sameCustomValue", () => {
  it("treats the same values in another order as unchanged", () => {
    expect(sameCustomValue("Red\nBlue", "Blue\nRed")).toBe(true);
  });

  it("sees a changed set of values", () => {
    expect(sameCustomValue("Red", "Red\nBlue")).toBe(false);
  });

  it("treats an empty and a missing value alike", () => {
    expect(sameCustomValue(null, "")).toBe(true);
  });
});
