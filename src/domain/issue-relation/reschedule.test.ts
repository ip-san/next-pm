import { describe, expect, it } from "bun:test";
import { addDays, computeRescheduledDates, computeSoonestStart } from "./reschedule";

describe("addDays", () => {
  it("adds positive days across a month boundary", () => {
    expect(addDays("2026-01-30", 5)).toBe("2026-02-04");
  });

  it("supports negative days", () => {
    expect(addDays("2026-02-01", -1)).toBe("2026-01-31");
  });
});

describe("computeSoonestStart", () => {
  it("returns null when there are no predecessors", () => {
    expect(computeSoonestStart([])).toBeNull();
  });

  it("returns null when no predecessor has any date", () => {
    expect(computeSoonestStart([{ startDate: null, dueDate: null, delay: 0 }])).toBeNull();
  });

  it("anchors on due_date over start_date when both are present", () => {
    const result = computeSoonestStart([{ startDate: "2026-01-01", dueDate: "2026-01-10", delay: 0 }]);
    expect(result).toBe("2026-01-11");
  });

  it("falls back to start_date when due_date is missing", () => {
    const result = computeSoonestStart([{ startDate: "2026-01-05", dueDate: null, delay: 0 }]);
    expect(result).toBe("2026-01-06");
  });

  it("adds the relation's delay on top of the +1 day gap", () => {
    const result = computeSoonestStart([{ startDate: null, dueDate: "2026-01-10", delay: 3 }]);
    expect(result).toBe("2026-01-14");
  });

  it("takes the latest candidate across multiple predecessors, not just the first", () => {
    const result = computeSoonestStart([
      { startDate: null, dueDate: "2026-01-10", delay: 0 },
      { startDate: null, dueDate: "2026-01-20", delay: 0 },
    ]);
    expect(result).toBe("2026-01-21");
  });

  it("ignores a dateless predecessor mixed in with dated ones", () => {
    const result = computeSoonestStart([
      { startDate: null, dueDate: null, delay: 0 },
      { startDate: null, dueDate: "2026-01-10", delay: 0 },
    ]);
    expect(result).toBe("2026-01-11");
  });
});

describe("computeRescheduledDates", () => {
  it("returns null when the successor already starts on soonestStart", () => {
    expect(computeRescheduledDates({ startDate: "2026-01-11", dueDate: "2026-01-15" }, "2026-01-11")).toBeNull();
  });

  it("returns null when the successor already starts after soonestStart (never pulled earlier)", () => {
    expect(computeRescheduledDates({ startDate: "2026-01-20", dueDate: "2026-01-25" }, "2026-01-11")).toBeNull();
  });

  it("shifts start and due forward, preserving the original duration", () => {
    const result = computeRescheduledDates({ startDate: "2026-01-01", dueDate: "2026-01-05" }, "2026-01-11");
    expect(result).toEqual({ startDate: "2026-01-11", dueDate: "2026-01-15" });
  });

  it("sets due_date to soonestStart (duration 0) when the successor had no due_date", () => {
    const result = computeRescheduledDates({ startDate: "2026-01-01", dueDate: null }, "2026-01-11");
    expect(result).toEqual({ startDate: "2026-01-11", dueDate: "2026-01-11" });
  });

  it("reschedules a successor that had no start_date at all", () => {
    const result = computeRescheduledDates({ startDate: null, dueDate: null }, "2026-01-11");
    expect(result).toEqual({ startDate: "2026-01-11", dueDate: "2026-01-11" });
  });
});
