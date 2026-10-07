import { DEFAULT_ISSUE_SORT, findColumn, type QueryColumn } from "./columns";

export type SortDirection = "asc" | "desc";
export type SortCriterion = [string, SortDirection];

/** Redmine's `SortCriteria#normalize!` truncates to the first three criteria. */
export const MAX_SORT_CRITERIA = 3;

/**
 * Port of `Redmine::SortCriteria` (lib/redmine/sort_criteria.rb): an ordered, de-duplicated
 * list of at most three [column, direction] pairs, serialized into the `sort` query
 * parameter as "key:desc,key2" with `asc` left implicit.
 */
export function parseSortCriteria(raw: string | undefined | null): SortCriterion[] {
  if (!raw) return [];
  const parsed = raw
    .split(",")
    .map((part) => part.split(":"))
    .map(([key, order]): SortCriterion => [key?.trim() ?? "", order?.trim() === "desc" ? "desc" : "asc"]);
  return normalizeSortCriteria(parsed);
}

export function normalizeSortCriteria(criteria: SortCriterion[]): SortCriterion[] {
  const seen = new Set<string>();
  const result: SortCriterion[] = [];
  for (const [key, direction] of criteria) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push([key, direction === "desc" ? "desc" : "asc"]);
    if (result.length === MAX_SORT_CRITERIA) break;
  }
  return result;
}

/** Inverse of `parseSortCriteria` — mirrors `SortCriteria#to_param`. */
export function serializeSortCriteria(criteria: SortCriterion[]): string {
  return criteria.map(([key, direction]) => (direction === "desc" ? `${key}:desc` : key)).join(",");
}

/**
 * Mirrors `SortCriteria#add!`: clicking a column header moves that column to the front of
 * the sort, keeping the previous keys as secondary criteria. Re-clicking the column that is
 * already primary flips its direction; otherwise the column's own `defaultOrder` is used,
 * matching Redmine's `sort_header_tag`.
 */
export function toggleSortCriteria(criteria: SortCriterion[], column: QueryColumn): SortCriterion[] {
  const [currentKey, currentDirection] = criteria[0] ?? [];
  const direction: SortDirection =
    currentKey === column.key ? (currentDirection === "asc" ? "desc" : "asc") : column.defaultOrder;
  return normalizeSortCriteria([[column.key, direction], ...criteria.filter(([key]) => key !== column.key)]);
}

/** Drops criteria naming a column that no longer exists or isn't sortable, then falls back to the default. */
export function resolveSortCriteria(columns: QueryColumn[], criteria: SortCriterion[]): SortCriterion[] {
  const valid = criteria.filter(([key]) => findColumn(columns, key)?.sortable);
  return valid.length > 0 ? valid : DEFAULT_ISSUE_SORT;
}

export function sortDirectionFor(criteria: SortCriterion[], key: string): SortDirection | null {
  return criteria.find(([criterionKey]) => criterionKey === key)?.[1] ?? null;
}
