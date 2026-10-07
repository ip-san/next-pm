import { describe, expect, it } from "bun:test";
import { ISSUE_QUERY_COLUMNS } from "./columns";
import type { FilterCondition, FilterOperator } from "./filter-builder";
import { validFilters } from "./validate-filters";

const columns = ISSUE_QUERY_COLUMNS;

function filter(field: string, operator: string, values: string[] = []): FilterCondition {
  return { field, operator: operator as FilterOperator, values };
}

describe("validFilters", () => {
  it("keeps a well-formed filter", () => {
    const input = [filter("status_id", "=", ["s1", "s2"])];
    expect(validFilters(columns, input)).toEqual(input);
  });

  it("drops a filter on a field this viewer has no column for", () => {
    expect(validFilters(columns, [filter("cf_deleted", "=", ["x"])])).toEqual([]);
    expect(validFilters(columns, [filter("nonsense", "=", ["x"])])).toEqual([]);
  });

  // Redmine only offers operators_by_filter_type[type] for a field; anything else is a
  // hand-edited URL and must not reach the SQL builder.
  it("drops an operator the column doesn't offer", () => {
    expect(validFilters(columns, [filter("status_id", "~", ["x"])])).toEqual([]);
    expect(validFilters(columns, [filter("subject", "o")])).toEqual([]);
    expect(validFilters(columns, [filter("status_id", "bogus", ["x"])])).toEqual([]);
  });

  it("keeps a valueless operator and clears any stray values", () => {
    expect(validFilters(columns, [filter("status_id", "o", ["ignored"])])).toEqual([filter("status_id", "o", [])]);
    expect(validFilters(columns, [filter("due_date", "w")])).toEqual([filter("due_date", "w", [])]);
  });

  it("drops a value-taking operator with no value", () => {
    expect(validFilters(columns, [filter("done_ratio", ">=", [])])).toEqual([]);
    expect(validFilters(columns, [filter("subject", "~", [""])])).toEqual([]);
  });

  it("drops a half-filled range and keeps a complete one", () => {
    expect(validFilters(columns, [filter("due_date", "><", ["2026-01-01", ""])])).toEqual([]);
    expect(validFilters(columns, [filter("due_date", "><", ["2026-01-01", "2026-02-01"])])).toHaveLength(1);
  });

  it("requires an ISO date for the date-valued operators", () => {
    expect(validFilters(columns, [filter("due_date", "=", ["yesterday"])])).toEqual([]);
    expect(validFilters(columns, [filter("due_date", "=", ["2026-13"])])).toEqual([]);
    expect(validFilters(columns, [filter("due_date", "=", ["2026-01-05"])])).toHaveLength(1);
  });

  it("requires a plain day count for the relative-date operators", () => {
    expect(validFilters(columns, [filter("due_date", "t-", ["-3"])])).toEqual([]);
    expect(validFilters(columns, [filter("due_date", "t-", ["three"])])).toEqual([]);
    expect(validFilters(columns, [filter("due_date", "t-", ["3"])])).toHaveLength(1);
  });

  it("requires a number on numeric columns", () => {
    expect(validFilters(columns, [filter("done_ratio", ">=", ["half"])])).toEqual([]);
    expect(validFilters(columns, [filter("estimated_hours", ">=", ["1.5"])])).toHaveLength(1);
    expect(validFilters(columns, [filter("done_ratio", ">=", ["50"])])).toHaveLength(1);
  });

  it("validates each row independently, keeping the good ones", () => {
    const result = validFilters(columns, [
      filter("status_id", "=", ["s1"]),
      filter("due_date", "=", ["not-a-date"]),
      filter("subject", "~", ["bug"]),
    ]);
    expect(result.map((f) => f.field)).toEqual(["status_id", "subject"]);
  });
});
