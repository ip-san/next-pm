import { describe, expect, it } from "bun:test";
import { findColumn, findColumnByFilterField, resolveDisplayColumns } from "./columns";
import { resolveSortCriteria } from "./sort";
import {
  DEFAULT_GLOBAL_TIME_ENTRY_COLUMN_KEYS,
  DEFAULT_TIME_ENTRY_COLUMN_KEYS,
  DEFAULT_TIME_ENTRY_FILTERS,
  DEFAULT_TIME_ENTRY_SORT,
  timeEntryQueryColumns,
} from "./time-entry-columns";

describe("timeEntryQueryColumns", () => {
  it("offers the project column and filter only on a cross-project list", () => {
    expect(findColumn(timeEntryQueryColumns({ customFields: [] }), "project")).toBeUndefined();
    const global = timeEntryQueryColumns({ customFields: [], crossProject: true });
    expect(findColumn(global, "project")?.groupable).toBe(true);
    expect(findColumnByFilterField(global, "project_id")?.key).toBe("project");
  });

  it("totals hours and nothing else among the static columns", () => {
    const columns = timeEntryQueryColumns({ customFields: [] });
    expect(columns.filter((column) => column.totalable).map((column) => column.key)).toEqual(["hours"]);
  });

  it("has no frozen column, unlike the issue catalog", () => {
    // Redmine's time entry list has no always-on `#` column, so an empty selection must
    // produce exactly the configured defaults.
    expect(timeEntryQueryColumns({ customFields: [] }).some((column) => column.frozen)).toBe(false);
  });

  it("sorts spent_on descending on the first header click", () => {
    expect(findColumn(timeEntryQueryColumns({ customFields: [] }), "spent_on")?.defaultOrder).toBe("desc");
  });
});

describe("time entry list defaults", () => {
  it("matches Setting.time_entry_list_defaults", () => {
    expect(DEFAULT_TIME_ENTRY_COLUMN_KEYS).toEqual(["spent_on", "user", "activity", "issue", "comments", "hours"]);
    expect(DEFAULT_GLOBAL_TIME_ENTRY_COLUMN_KEYS[0]).toBe("project");
  });

  it("filters on nothing by default, unlike IssueQuery's open-issues filter", () => {
    expect(DEFAULT_TIME_ENTRY_FILTERS).toEqual([{ field: "spent_on", operator: "*", values: [] }]);
  });

  it("falls back to spent_on desc rather than the issue list's id desc", () => {
    const columns = timeEntryQueryColumns({ customFields: [] });
    expect(resolveSortCriteria(columns, [], DEFAULT_TIME_ENTRY_SORT)).toEqual([["spent_on", "desc"]]);
    // An unsortable key is dropped and the default takes over.
    expect(resolveSortCriteria(columns, [["nope", "asc"]], DEFAULT_TIME_ENTRY_SORT)).toEqual([["spent_on", "desc"]]);
  });

  it("renders the configured default columns when the URL names none", () => {
    const columns = timeEntryQueryColumns({ customFields: [], crossProject: true });
    expect(resolveDisplayColumns(columns, [], DEFAULT_GLOBAL_TIME_ENTRY_COLUMN_KEYS).map((column) => column.key)).toEqual(
      DEFAULT_GLOBAL_TIME_ENTRY_COLUMN_KEYS,
    );
  });
});
