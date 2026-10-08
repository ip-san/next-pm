import type { CustomField } from "@/domain/custom-field/entity";
import { customFieldColumn, OPERATORS_BY_FILTER_TYPE, type FilterInputKind, type FilterType, type QueryColumn } from "./columns";
import type { FilterOperator } from "./filter-builder";

function column(
  key: string,
  label: string,
  options: Partial<Omit<QueryColumn, "key" | "label">> & { filterType?: FilterType; filterInput?: FilterInputKind; filterField?: string },
): QueryColumn {
  return {
    key,
    filterField: options.filterType ? (options.filterField ?? key) : null,
    label,
    sortable: options.sortable ?? false,
    groupable: options.groupable ?? false,
    totalable: options.totalable ?? false,
    defaultOrder: options.defaultOrder ?? "asc",
    frozen: options.frozen,
    filterOperators: options.filterType ? [...OPERATORS_BY_FILTER_TYPE[options.filterType]] : null,
    filterInput: options.filterInput ?? null,
  };
}

/**
 * next-pm's `TimeEntryQuery.available_columns`, reduced to the attributes the time_entries
 * table actually has. Deliberately absent relative to Redmine: `tweek` (no tyear/tweek
 * columns), the `issue.*` association columns (tracker/parent/status/category/fixed_version
 * — they need the issue joins the report page doesn't have either) and the project/user
 * association custom fields.
 */
export const TIME_ENTRY_QUERY_COLUMNS: QueryColumn[] = [
  column("spent_on", "日付", { sortable: true, groupable: true, defaultOrder: "desc", filterType: "date_past", filterInput: "date" }),
  column("user", "ユーザー", { sortable: true, groupable: true, filterType: "list_optional", filterInput: "user", filterField: "user_id" }),
  column("author", "記録者", { sortable: true, filterType: "list_optional", filterInput: "user", filterField: "author_id" }),
  column("activity", "作業分類", { sortable: true, groupable: true, filterType: "list", filterInput: "list", filterField: "activity_id" }),
  // Redmine's `issue_id` filter is type `tree`; next-pm has no nested set, and its issue ids
  // are UUIDs with nothing to autocomplete against in the filter row, so only the
  // present/absent operators of `list_optional` are offered a value list. `=` still works
  // when a link supplies the id, which is how the issue page reaches this list.
  column("issue", "チケット", { sortable: true, groupable: true, filterType: "list_optional", filterInput: "list", filterField: "issue_id" }),
  column("comments", "コメント", { sortable: true, filterType: "text", filterInput: "text" }),
  column("hours", "時間", { sortable: true, totalable: true, filterType: "float", filterInput: "number" }),
  column("created_on", "記録日時", { sortable: true, groupable: true, defaultOrder: "desc", filterType: "date_past", filterInput: "date" }),
];

/** Only offered on the cross-project list, matching `add_available_filter("project_id", ...) if project.nil?`. */
export const TIME_ENTRY_PROJECT_COLUMN: QueryColumn = column("project", "プロジェクト", {
  sortable: true,
  groupable: true,
  filterType: "list",
  filterInput: "list",
  filterField: "project_id",
});

/** `Setting.time_entry_list_defaults[:column_names]` (config/settings.yml). */
export const DEFAULT_TIME_ENTRY_COLUMN_KEYS = ["spent_on", "user", "activity", "issue", "comments", "hours"];

/** `TimeEntryQuery#default_columns_names` prepends `project` when there's no project in scope. */
export const DEFAULT_GLOBAL_TIME_ENTRY_COLUMN_KEYS = ["project", ...DEFAULT_TIME_ENTRY_COLUMN_KEYS];

/** `Setting.time_entry_list_defaults[:totalable_names]`. */
export const DEFAULT_TIME_ENTRY_TOTALABLE_KEYS = ["hours"];

/** `TimeEntryQuery#default_sort_criteria`. */
export const DEFAULT_TIME_ENTRY_SORT: [string, "asc" | "desc"][] = [["spent_on", "desc"]];

/**
 * `TimeEntryQuery#initialize`'s `self.filters ||= {'spent_on' => {:operator => "*"}}` — a
 * brand new time-entry query filters on nothing, unlike IssueQuery's "open issues only".
 */
export const DEFAULT_TIME_ENTRY_FILTERS = [{ field: "spent_on", operator: "*" as FilterOperator, values: [] }];

/** The full column catalog for one viewer: the static columns, the project column on a cross-project list, and the time-entry custom fields. */
export function timeEntryQueryColumns(options: { customFields: CustomField[]; crossProject?: boolean }): QueryColumn[] {
  const columns = options.crossProject ? [TIME_ENTRY_PROJECT_COLUMN, ...TIME_ENTRY_QUERY_COLUMNS] : [...TIME_ENTRY_QUERY_COLUMNS];
  return columns.concat(options.customFields.map(customFieldColumn));
}
