import type { FilterCondition, FilterOperator } from "@/domain/query/filter-builder";
import { parseSortCriteria, serializeSortCriteria, type SortCriterion } from "@/domain/query/sort";

/**
 * The issue list's URL contract, kept identical to Redmine's (`Query#build_from_params` /
 * `#as_params`) so links, bookmarks and the CSV/PDF export URLs stay interchangeable:
 *
 *   set_filter=1            switch from the default/saved query to the params below
 *   f[]=status_id           the filtered fields
 *   op[status_id]==         each field's operator
 *   v[status_id][]=<value>  each field's values
 *   c[]=tracker             the displayed columns, in order
 *   t[]=estimated_hours     the totals to show
 *   group_by=status
 *   sort=status,due_date:desc
 *   query_id=<uuid>         apply a saved query instead
 *   page / per_page
 *
 * Next 16 hands a page's `searchParams` over as a plain object whose repeated keys are
 * arrays (`?a=1&a=2` -> `{a: ['1','2']}`), and the bracketed names arrive verbatim as keys
 * like `"v[status_id][]"`, so both that object and a route handler's `URLSearchParams`
 * normalize into the same `Record<string, string[]>` before parsing.
 */
export type RawSearchParams = Record<string, string[]>;

export interface IssueListParams {
  queryId: string | null;
  /** Redmine's `set_filter`: the params carry an ad-hoc query rather than the default one. */
  setFilter: boolean;
  filters: FilterCondition[];
  columnKeys: string[];
  groupBy: string | null;
  sortCriteria: SortCriterion[];
  totalableKeys: string[];
  page: string | undefined;
  perPage: string | undefined;
}

export function normalizeSearchParams(input: Record<string, string | string[] | undefined> | URLSearchParams): RawSearchParams {
  const result: RawSearchParams = {};
  if (input instanceof URLSearchParams) {
    for (const [key, value] of input.entries()) {
      (result[key] ??= []).push(value);
    }
    return result;
  }
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    result[key] = Array.isArray(value) ? value : [value];
  }
  return result;
}

function first(params: RawSearchParams, key: string): string | undefined {
  return params[key]?.[0];
}

export function parseIssueListParams(raw: RawSearchParams): IssueListParams {
  return {
    queryId: first(raw, "query_id") ?? null,
    setFilter: first(raw, "set_filter") === "1",
    filters: parseFilters(raw),
    columnKeys: raw["c[]"] ?? [],
    groupBy: first(raw, "group_by") || null,
    sortCriteria: parseSortCriteria(first(raw, "sort")),
    totalableKeys: raw["t[]"] ?? [],
    page: first(raw, "page"),
    perPage: first(raw, "per_page"),
  };
}

function parseFilters(raw: RawSearchParams): FilterCondition[] {
  const fields = raw["f[]"] ?? [];
  const conditions: FilterCondition[] = [];
  for (const field of fields) {
    // Redmine renders a trailing blank `f[]=` to keep the form submitting when every filter
    // row was removed; it carries no filter.
    if (!field) continue;
    const operator = first(raw, `op[${field}]`);
    if (!operator) continue;
    conditions.push({ field, operator: operator as FilterOperator, values: raw[`v[${field}][]`] ?? [] });
  }

  // Backwards compatibility with the pre-query-engine `?status_id=<id>` shortcut that the
  // project overview, roadmap and version pages still link with.
  const statusShortcut = first(raw, "status_id");
  if (conditions.length === 0 && statusShortcut) {
    conditions.push({ field: "status_id", operator: "=", values: [statusShortcut] });
  }
  return conditions;
}

/** Inverse of `parseIssueListParams` — the `as_params` half, used to build every list link. */
export function serializeIssueListParams(params: Partial<IssueListParams>): URLSearchParams {
  const search = new URLSearchParams();
  if (params.queryId) search.set("query_id", params.queryId);
  if (params.setFilter) search.set("set_filter", "1");

  for (const condition of params.filters ?? []) {
    search.append("f[]", condition.field);
    search.set(`op[${condition.field}]`, condition.operator);
    for (const value of condition.values) {
      search.append(`v[${condition.field}][]`, value);
    }
  }
  for (const key of params.columnKeys ?? []) search.append("c[]", key);
  for (const key of params.totalableKeys ?? []) search.append("t[]", key);
  if (params.groupBy) search.set("group_by", params.groupBy);
  if (params.sortCriteria && params.sortCriteria.length > 0) search.set("sort", serializeSortCriteria(params.sortCriteria));
  if (params.perPage) search.set("per_page", params.perPage);
  if (params.page) search.set("page", params.page);
  return search;
}

/**
 * Builds a list URL from the current params plus an override — what the column headers, the
 * pager and the CSV/PDF buttons all link to. A saved query keeps its `query_id` so the
 * links stay inside that query unless the override replaces it.
 */
export function issueListHref(basePath: string, params: IssueListParams, overrides: Partial<IssueListParams> = {}): string {
  const merged: IssueListParams = { ...params, ...overrides };
  // Any ad-hoc change to the filters/columns/grouping detaches from the saved query, the
  // way Redmine's forms submit `set_filter=1` without a `query_id`.
  const search = serializeIssueListParams(merged.queryId ? { ...merged, setFilter: false } : { ...merged, setFilter: true });
  const encoded = search.toString();
  return encoded ? `${basePath}?${encoded}` : basePath;
}
