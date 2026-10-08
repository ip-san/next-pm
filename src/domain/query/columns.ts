import type { CustomField } from "@/domain/custom-field/entity";
import type { FilterOperator } from "./filter-builder";

/**
 * Mirrors `Redmine::QueryColumn` — one entry per column the issue list can display, sort
 * by, group by or total. Redmine builds these as objects carrying the SQL to sort/group on;
 * next-pm keeps the catalog free of SQL (the infrastructure layer owns the column mapping)
 * so the same catalog can be rendered by the column chooser and validated on the server.
 */
export interface QueryColumn {
  /** Redmine's `QueryColumn#name`, and the value used in the `c[]` / `group_by` / `sort` params. */
  key: string;
  /**
   * Redmine's filter name for the same attribute, which is *not* the column name for
   * association columns (`status_id` vs the `status` column). Null when the column can't
   * be filtered on. Custom fields use the same `cf_<id>` string for both.
   */
  filterField: string | null;
  label: string;
  sortable: boolean;
  groupable: boolean;
  /** Redmine's `totalable` — only numeric columns can appear in the totals row. */
  totalable: boolean;
  /** Redmine's `default_order` — the direction a first click on the header sorts in. */
  defaultOrder: "asc" | "desc";
  /** Redmine's `frozen` — the `#` column is always displayed and cannot be deselected. */
  frozen?: boolean;
  /** Operators offered for this column's filter, or null when the column isn't filterable. */
  filterOperators: FilterOperator[] | null;
  /** How the filter UI should collect values. */
  filterInput: FilterInputKind | null;
}

export type FilterInputKind = "status" | "tracker" | "priority" | "user" | "category" | "version" | "text" | "date" | "number" | "bool" | "list";

/**
 * Redmine's `operators_by_filter_type` (query.rb), restricted to the filter types next-pm
 * has columns for. Kept as data so the filter-builder UI and the server-side validator read
 * the same table.
 */
export const OPERATORS_BY_FILTER_TYPE = {
  list: ["=", "!"],
  list_status: ["o", "=", "!", "c", "*"],
  list_optional: ["=", "!", "!*", "*"],
  date: ["=", ">=", "<=", "><", "<t+", ">t+", "><t+", "t+", "nd", "t", "ld", "nw", "w", "lw", "l2w", "nm", "m", "lm", "y", ">t-", "<t-", "><t-", "t-", "!*", "*"],
  date_past: ["=", ">=", "<=", "><", ">t-", "<t-", "><t-", "t-", "t", "ld", "w", "lw", "l2w", "m", "lm", "y", "!*", "*"],
  string: ["~", "=", "!~", "!", "^", "$", "!*", "*"],
  text: ["~", "!~", "^", "$", "!*", "*"],
  integer: ["=", ">=", "<=", "><", "!*", "*"],
  float: ["=", ">=", "<=", "><", "!*", "*"],
  bool: ["=", "!*", "*"],
} as const satisfies Record<string, readonly FilterOperator[]>;

export type FilterType = keyof typeof OPERATORS_BY_FILTER_TYPE;

/**
 * Operators that take no value — Redmine's `validate_query_filters` skips the "value is
 * blank" error for exactly this set, and the filter UI hides the value input for them.
 */
export const VALUELESS_OPERATORS: FilterOperator[] = ["o", "c", "!*", "*", "nd", "t", "ld", "nw", "w", "lw", "l2w", "nm", "m", "lm", "y"];

/** Operators whose value is a plain day count rather than a date (Redmine's `/^\d+$/` rule). */
export const DAY_COUNT_OPERATORS: FilterOperator[] = [">t-", "<t-", "t-", ">t+", "<t+", "t+", "><t+", "><t-"];

/** Operators taking two values rather than one. */
export const RANGE_OPERATORS: FilterOperator[] = ["><"];

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
 * next-pm's equivalent of `IssueQuery.available_columns`, reduced to the attributes the
 * issues table actually has. Deliberately absent relative to Redmine: `parent` (next-pm's
 * subtask tree is an adjacency list with no root_id/lft/rgt to sort on), `closed_on`,
 * `last_updated_by`, `relations`, `attachments`, `last_notes`, `total_estimated_hours` and
 * `total_spent_hours` (all need the nested set or columns next-pm doesn't store).
 */
export const ISSUE_QUERY_COLUMNS: QueryColumn[] = [
  // Redmine sorts `id` on the integer primary key; next-pm's ids are random UUIDs with no
  // meaningful order, so the sort maps to created_at in the infrastructure layer instead.
  column("id", "#", { sortable: true, defaultOrder: "desc", frozen: true }),
  column("tracker", "トラッカー", { sortable: true, groupable: true, filterType: "list", filterInput: "tracker", filterField: "tracker_id" }),
  column("status", "ステータス", { sortable: true, groupable: true, filterType: "list_status", filterInput: "status", filterField: "status_id" }),
  column("priority", "優先度", { sortable: true, groupable: true, defaultOrder: "desc", filterType: "list", filterInput: "priority", filterField: "priority_id" }),
  column("subject", "題名", { sortable: true, filterType: "text", filterInput: "text" }),
  column("author", "作成者", { sortable: true, groupable: true, filterType: "list", filterInput: "user", filterField: "author_id" }),
  column("assigned_to", "担当者", { sortable: true, groupable: true, filterType: "list_optional", filterInput: "user", filterField: "assigned_to_id" }),
  column("category", "カテゴリ", { sortable: true, groupable: true, filterType: "list_optional", filterInput: "category", filterField: "category_id" }),
  column("fixed_version", "対象バージョン", { sortable: true, groupable: true, filterType: "list_optional", filterInput: "version", filterField: "fixed_version_id" }),
  column("start_date", "開始日", { sortable: true, groupable: true, filterType: "date", filterInput: "date" }),
  column("due_date", "期日", { sortable: true, groupable: true, filterType: "date", filterInput: "date" }),
  column("estimated_hours", "予定工数", { sortable: true, totalable: true, filterType: "float", filterInput: "number" }),
  column("done_ratio", "進捗率", { sortable: true, groupable: true, filterType: "integer", filterInput: "number" }),
  column("is_private", "プライベート", { sortable: true, groupable: true, filterType: "list", filterInput: "bool" }),
  column("created_on", "作成日", { sortable: true, groupable: true, defaultOrder: "desc", filterType: "date_past", filterInput: "date" }),
  column("updated_on", "更新日", { sortable: true, groupable: true, defaultOrder: "desc", filterType: "date_past", filterInput: "date" }),
];

/**
 * Redmine adds `spent_hours` to `available_columns` only when the viewer holds
 * `view_time_entries` globally (issue_query.rb#initialize_available_columns), because the
 * column is a SUM over time entries the viewer may not be allowed to see. Same gate here.
 */
/**
 * Redmine offers the `project` column and the `project_id` filter only on the cross-project
 * list (`IssueQuery#initialize_available_filters` guards both with `if project.nil?`) — in
 * a project's own list every row has the same project, so the column would be noise and the
 * filter a way to ask for rows the page can't show.
 */
export const PROJECT_COLUMN: QueryColumn = column("project", "プロジェクト", {
  sortable: true,
  groupable: true,
  filterType: "list",
  filterInput: "list",
  filterField: "project_id",
});

export const SPENT_HOURS_COLUMN: QueryColumn = column("spent_hours", "作業時間", {
  sortable: true,
  totalable: true,
  defaultOrder: "desc",
});

/** Looks a filter field name (`status_id`, `cf_<id>`) up in a column catalog. */
export function findColumnByFilterField(columns: QueryColumn[], filterField: string): QueryColumn | undefined {
  return columns.find((column) => column.filterField === filterField);
}

/** Redmine's `Setting.issue_list_default_columns` default (config/settings.yml). */
export const DEFAULT_ISSUE_COLUMN_KEYS = ["tracker", "status", "priority", "subject", "assigned_to", "updated_on"];

/** `IssueQuery#default_columns_names` prepends `project` when there's no project in scope. */
export const DEFAULT_GLOBAL_ISSUE_COLUMN_KEYS = ["project", ...DEFAULT_ISSUE_COLUMN_KEYS];

/** Redmine's `IssueQuery#default_sort_criteria`. */
export const DEFAULT_ISSUE_SORT: [string, "asc" | "desc"][] = [["id", "desc"]];

/** Redmine's `IssueQuery` default filter — a brand new query shows open issues only. */
export const DEFAULT_ISSUE_FILTERS = [{ field: "status_id", operator: "o" as FilterOperator, values: [] }];

/**
 * Maps a custom field to its query column, mirroring `QueryCustomFieldColumn`. Only int and
 * float fields are totalable (`CustomField#totalable?` is `format.totalable_supported`,
 * true only for the Numeric formats), and float fields are *not* groupable — Redmine's
 * FloatFormat is the one numeric format that doesn't override `group_statement`.
 */
export function customFieldColumn(field: CustomField): QueryColumn {
  const numeric = field.fieldFormat === "int" || field.fieldFormat === "float";
  return {
    key: customFieldColumnKey(field.id),
    filterField: customFieldColumnKey(field.id),
    label: field.name,
    sortable: true,
    groupable: field.fieldFormat !== "text" && field.fieldFormat !== "float",
    totalable: numeric,
    defaultOrder: "asc",
    filterOperators: [...OPERATORS_BY_FILTER_TYPE[customFieldFilterType(field)]],
    filterInput: customFieldFilterInput(field),
  };
}

export function customFieldColumnKey(customFieldId: string): string {
  return `cf_${customFieldId}`;
}

/** Returns the custom field id when `key` is a `cf_<id>` column/filter name, else null. */
export function parseCustomFieldKey(key: string): string | null {
  return key.startsWith("cf_") ? key.slice(3) : null;
}

function customFieldFilterType(field: CustomField): FilterType {
  switch (field.fieldFormat) {
    case "int":
      return "integer";
    case "float":
      return "float";
    case "date":
      return "date";
    case "bool":
      return "bool";
    case "list":
      return "list_optional";
    case "text":
      return "text";
    case "string":
      return "string";
  }
}

function customFieldFilterInput(field: CustomField): FilterInputKind {
  switch (field.fieldFormat) {
    case "int":
    case "float":
      return "number";
    case "date":
      return "date";
    case "bool":
      return "bool";
    case "list":
      return "list";
    default:
      return "text";
  }
}

/**
 * The full column catalog for one viewer: the static issue columns, `spent_hours` when the
 * viewer may see time entries, and one column per issue custom field.
 */
export function issueQueryColumns(options: {
  customFields: CustomField[];
  canViewTimeEntries: boolean;
  /** Set on the cross-project list, where Redmine adds the project column and its filter. */
  crossProject?: boolean;
}): QueryColumn[] {
  const columns = [...ISSUE_QUERY_COLUMNS];
  if (options.crossProject) {
    // Right after the frozen `#` column, where Redmine's default column order puts it.
    columns.splice(1, 0, PROJECT_COLUMN);
    // `add_available_filter("category_id", ...) if project` — categories belong to one
    // project, so there is no cross-project set of values to offer. The column stays
    // displayable; only its filter goes away.
    const category = columns.findIndex((column) => column.key === "category");
    if (category >= 0) {
      columns[category] = { ...columns[category], filterField: null, filterOperators: null, filterInput: null };
    }
  }
  if (options.canViewTimeEntries) {
    columns.push(SPENT_HOURS_COLUMN);
  }
  return columns.concat(options.customFields.map(customFieldColumn));
}

export function findColumn(columns: QueryColumn[], key: string): QueryColumn | undefined {
  return columns.find((column) => column.key === key);
}

/**
 * Resolves the display column list the way `Query#columns` does: the frozen columns are
 * always present, an empty selection falls back to the defaults, and unknown keys (a stale
 * saved query naming a deleted custom field) are dropped rather than failing the page.
 */
export function resolveDisplayColumns(columns: QueryColumn[], selectedKeys: string[], defaultKeys: string[] = DEFAULT_ISSUE_COLUMN_KEYS): QueryColumn[] {
  const keys = selectedKeys.length > 0 ? selectedKeys : defaultKeys;
  const selected = keys.map((key) => findColumn(columns, key)).filter((column): column is QueryColumn => column !== undefined);
  const frozen = columns.filter((column) => column.frozen && !selected.includes(column));
  return [...frozen, ...selected];
}
