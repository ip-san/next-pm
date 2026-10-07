import { describe, expect, it } from "bun:test";
import { compileFilters, DEFAULT_FIRST_DAY_OF_WEEK, type FilterContext } from "./filter-builder";

// 2026-10-07 is a Wednesday (cwday 3). With Redmine's locale default of first_day_of_week=7
// (Sunday), "this week" is 2026-10-04 (Sun) .. 2026-10-10 (Sat).
const context: FilterContext = {
  today: "2026-10-07",
  userId: "user-1",
  openStatusIds: ["s-new", "s-progress"],
  closedStatusIds: ["s-closed"],
  firstDayOfWeek: DEFAULT_FIRST_DAY_OF_WEEK,
};

describe("compileFilters", () => {
  it("compiles equals and not-equals", () => {
    expect(compileFilters([{ field: "status_id", operator: "=", values: ["new"] }], context)).toEqual([
      { field: "status_id", kind: "eq", values: ["new"] },
    ]);
    expect(compileFilters([{ field: "status_id", operator: "!", values: ["closed"] }], context)).toEqual([
      { field: "status_id", kind: "neq", values: ["closed"] },
    ]);
  });

  it("compiles is-empty and is-not-empty without needing values", () => {
    expect(compileFilters([{ field: "assigned_to_id", operator: "!*", values: [] }], context)).toEqual([
      { field: "assigned_to_id", kind: "isNull", values: [] },
    ]);
    expect(compileFilters([{ field: "assigned_to_id", operator: "*", values: [] }], context)).toEqual([
      { field: "assigned_to_id", kind: "isNotNull", values: [] },
    ]);
  });

  it("compiles numeric range operators", () => {
    expect(compileFilters([{ field: "done_ratio", operator: ">=", values: ["50"] }], context)).toEqual([
      { field: "done_ratio", kind: "gte", values: ["50"] },
    ]);
    expect(compileFilters([{ field: "done_ratio", operator: "><", values: ["10", "90"] }], context)).toEqual([
      { field: "done_ratio", kind: "between", values: ["10", "90"] },
    ]);
  });

  it("compiles text contains/starts-with/ends-with", () => {
    expect(compileFilters([{ field: "subject", operator: "~", values: ["bug"] }], context)).toEqual([
      { field: "subject", kind: "contains", values: ["bug"] },
    ]);
    expect(compileFilters([{ field: "subject", operator: "^", values: ["bug"] }], context)).toEqual([
      { field: "subject", kind: "startsWith", values: ["bug"] },
    ]);
    expect(compileFilters([{ field: "subject", operator: "$", values: ["bug"] }], context)).toEqual([
      { field: "subject", kind: "endsWith", values: ["bug"] },
    ]);
  });

  it("compiles multiple conditions independently, preserving order", () => {
    const compiled = compileFilters(
      [
        { field: "status_id", operator: "=", values: ["new"] },
        { field: "priority_id", operator: "=", values: ["high"] },
      ],
      context,
    );
    expect(compiled.map((c) => c.field)).toEqual(["status_id", "priority_id"]);
  });

  it("throws when a range operator is missing its required value", () => {
    expect(() => compileFilters([{ field: "done_ratio", operator: ">=", values: [] }], context)).toThrow(/missing value/);
  });

  describe("Redmine's open/closed status operators", () => {
    it("expands `o` and `c` into the matching status id sets", () => {
      expect(compileFilters([{ field: "status_id", operator: "o", values: [] }], context)).toEqual([
        { field: "status_id", kind: "eq", values: ["s-new", "s-progress"] },
      ]);
      expect(compileFilters([{ field: "status_id", operator: "c", values: [] }], context)).toEqual([
        { field: "status_id", kind: "eq", values: ["s-closed"] },
      ]);
    });

    it("drops `o` on any field other than status_id, as query.rb's `if field == \"status_id\"` guard does", () => {
      expect(compileFilters([{ field: "tracker_id", operator: "o", values: [] }], context)).toEqual([]);
    });

    it("matches nothing rather than everything when no status is open", () => {
      const noneOpen = { ...context, openStatusIds: [] };
      expect(compileFilters([{ field: "status_id", operator: "o", values: [] }], noneOpen)).toEqual([
        { field: "status_id", kind: "never", values: [] },
      ]);
    });
  });

  describe("Redmine's empty-value-set rules", () => {
    it("turns `=` with no values into a match-nothing predicate (query.rb's 1=0)", () => {
      expect(compileFilters([{ field: "status_id", operator: "=", values: [] }], context)).toEqual([
        { field: "status_id", kind: "never", values: [] },
      ]);
    });

    it("drops `!` with no values entirely (query.rb's 1=1)", () => {
      expect(compileFilters([{ field: "status_id", operator: "!", values: [] }], context)).toEqual([]);
    });
  });

  describe("the `me` magic value", () => {
    it("substitutes the current user's id", () => {
      expect(compileFilters([{ field: "assigned_to_id", operator: "=", values: ["me"] }], context)).toEqual([
        { field: "assigned_to_id", kind: "eq", values: ["user-1"] },
      ]);
    });

    it("drops `me` for an anonymous visitor, leaving the filter matching nothing", () => {
      const anonymous = { ...context, userId: null };
      expect(compileFilters([{ field: "assigned_to_id", operator: "=", values: ["me"] }], anonymous)).toEqual([
        { field: "assigned_to_id", kind: "never", values: [] },
      ]);
    });

    it("keeps the other selected users alongside the substitution", () => {
      expect(compileFilters([{ field: "author_id", operator: "=", values: ["me", "user-2"] }], context)).toEqual([
        { field: "author_id", kind: "eq", values: ["user-1", "user-2"] },
      ]);
    });
  });

  describe("date shortcuts", () => {
    it("resolves today / yesterday / tomorrow", () => {
      expect(compileFilters([{ field: "due_date", operator: "t", values: [] }], context)).toEqual([
        { field: "due_date", kind: "between", values: ["2026-10-07", "2026-10-07"] },
      ]);
      expect(compileFilters([{ field: "due_date", operator: "ld", values: [] }], context)).toEqual([
        { field: "due_date", kind: "between", values: ["2026-10-06", "2026-10-06"] },
      ]);
      expect(compileFilters([{ field: "due_date", operator: "nd", values: [] }], context)).toEqual([
        { field: "due_date", kind: "between", values: ["2026-10-08", "2026-10-08"] },
      ]);
    });

    it("resolves this/last/next week from the locale's first day of week (Sunday)", () => {
      expect(compileFilters([{ field: "due_date", operator: "w", values: [] }], context)).toEqual([
        { field: "due_date", kind: "between", values: ["2026-10-04", "2026-10-10"] },
      ]);
      expect(compileFilters([{ field: "due_date", operator: "lw", values: [] }], context)).toEqual([
        { field: "due_date", kind: "between", values: ["2026-09-27", "2026-10-03"] },
      ]);
      expect(compileFilters([{ field: "due_date", operator: "nw", values: [] }], context)).toEqual([
        { field: "due_date", kind: "between", values: ["2026-10-11", "2026-10-17"] },
      ]);
    });

    it("resolves last-2-weeks as ending yesterday-of-this-week, not at the end of last week", () => {
      expect(compileFilters([{ field: "due_date", operator: "l2w", values: [] }], context)).toEqual([
        { field: "due_date", kind: "between", values: ["2026-09-20", "2026-10-03"] },
      ]);
    });

    it("resolves this/last/next month across the year boundary", () => {
      expect(compileFilters([{ field: "due_date", operator: "m", values: [] }], context)).toEqual([
        { field: "due_date", kind: "between", values: ["2026-10-01", "2026-10-31"] },
      ]);
      expect(compileFilters([{ field: "due_date", operator: "lm", values: [] }], context)).toEqual([
        { field: "due_date", kind: "between", values: ["2026-09-01", "2026-09-30"] },
      ]);
      expect(compileFilters([{ field: "due_date", operator: "nm", values: [] }], { ...context, today: "2026-12-15" })).toEqual([
        { field: "due_date", kind: "between", values: ["2027-01-01", "2027-01-31"] },
      ]);
    });

    it("resolves this year", () => {
      expect(compileFilters([{ field: "due_date", operator: "y", values: [] }], context)).toEqual([
        { field: "due_date", kind: "between", values: ["2026-01-01", "2026-12-31"] },
      ]);
    });

    it("resolves the relative day-count operators the way relative_date_clause does", () => {
      // >t- is "less than n days ago" => >= today - n
      expect(compileFilters([{ field: "due_date", operator: ">t-", values: ["3"] }], context)).toEqual([
        { field: "due_date", kind: "gte", values: ["2026-10-04"] },
      ]);
      // <t- is "more than n days ago" => <= today - n
      expect(compileFilters([{ field: "due_date", operator: "<t-", values: ["3"] }], context)).toEqual([
        { field: "due_date", kind: "lte", values: ["2026-10-04"] },
      ]);
      expect(compileFilters([{ field: "due_date", operator: "t-", values: ["3"] }], context)).toEqual([
        { field: "due_date", kind: "between", values: ["2026-10-04", "2026-10-04"] },
      ]);
      expect(compileFilters([{ field: "due_date", operator: "><t-", values: ["3"] }], context)).toEqual([
        { field: "due_date", kind: "between", values: ["2026-10-04", "2026-10-07"] },
      ]);
      expect(compileFilters([{ field: "due_date", operator: "><t+", values: ["3"] }], context)).toEqual([
        { field: "due_date", kind: "between", values: ["2026-10-07", "2026-10-10"] },
      ]);
      expect(compileFilters([{ field: "due_date", operator: "t+", values: ["3"] }], context)).toEqual([
        { field: "due_date", kind: "between", values: ["2026-10-10", "2026-10-10"] },
      ]);
    });

    it("rejects a non-numeric day count", () => {
      expect(() => compileFilters([{ field: "due_date", operator: "t-", values: ["soon"] }], context)).toThrow(/needs a number/);
    });
  });
});
