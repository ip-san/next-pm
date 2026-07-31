import { describe, expect, it } from "bun:test";
import { buildMonthGrid, nextMonth, parseYearMonth, previousMonth } from "./month-grid";

describe("buildMonthGrid", () => {
  it("pads a month that doesn't start on Monday to full weeks", () => {
    // 2026-07-01 is a Wednesday, so the grid must start on the preceding Monday (2026-06-29)
    const grid = buildMonthGrid(2026, 7);
    expect(grid.startDate).toBe("2026-06-29");
    // 2026-07-31 is a Friday, so the grid must end on the following Sunday (2026-08-02)
    expect(grid.endDate).toBe("2026-08-02");
    expect(grid.weeks.every((week) => week.length === 7)).toBe(true);
    expect(grid.weeks.flat()).toContain("2026-07-01");
    expect(grid.weeks.flat()).toContain("2026-07-31");
  });

  it("returns the exact month with no padding when it already spans full weeks", () => {
    // 2026-06-01 is a Monday and 2026-06-30 is a Tuesday, so June 2026 needs trailing padding
    // only — pick a month where day-of-week alignment happens to need zero padding instead:
    // 2027-02-01 is a Monday, 2027-02-28 is a Sunday.
    const grid = buildMonthGrid(2027, 2);
    expect(grid.startDate).toBe("2027-02-01");
    expect(grid.endDate).toBe("2027-02-28");
  });
});

describe("parseYearMonth", () => {
  const now = new Date(Date.UTC(2026, 6, 31));

  it("uses the provided year/month when valid", () => {
    expect(parseYearMonth("2025", "3", now)).toEqual({ year: 2025, month: 3 });
  });

  it("falls back to now when missing", () => {
    expect(parseYearMonth(undefined, undefined, now)).toEqual({ year: 2026, month: 7 });
  });

  it("falls back to now on malformed input", () => {
    expect(parseYearMonth("not-a-year", "13", now)).toEqual({ year: 2026, month: 7 });
    expect(parseYearMonth("2026", "0", now)).toEqual({ year: 2026, month: 7 });
  });
});

describe("previousMonth / nextMonth", () => {
  it("rolls over the year at the boundaries", () => {
    expect(previousMonth(2026, 1)).toEqual({ year: 2025, month: 12 });
    expect(nextMonth(2026, 12)).toEqual({ year: 2027, month: 1 });
  });

  it("stays within the year otherwise", () => {
    expect(previousMonth(2026, 7)).toEqual({ year: 2026, month: 6 });
    expect(nextMonth(2026, 7)).toEqual({ year: 2026, month: 8 });
  });
});
