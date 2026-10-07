import { DAY_COUNT_OPERATORS, findColumnByFilterField, RANGE_OPERATORS, VALUELESS_OPERATORS, type QueryColumn } from "./columns";
import type { FilterCondition } from "./filter-builder";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_COUNT = /^\d+$/;
const FLOAT = /^[+-]?\d+(\.\d*)?$/;

/** Operators whose value is compared as a date rather than free text. */
const DATE_VALUE_OPERATORS = ["=", ">=", "<=", "><"];

/**
 * Port of Redmine's `Query#validate_query_filters` (query.rb#L496), used to drop rather
 * than reject: filter rows arrive from a query string anyone can hand-edit, so an unknown
 * field, an operator the column doesn't offer, or a value of the wrong shape must not reach
 * the SQL builder. Redmine marks the whole query invalid and re-renders the form; the issue
 * list is more forgiving and simply ignores the offending row, which keeps a stale
 * bookmark (say, one naming a since-deleted custom field) working instead of erroring.
 */
export function validFilters(columns: QueryColumn[], filters: FilterCondition[]): FilterCondition[] {
  return filters
    .map((filter) => normalizeFilter(columns, filter))
    .filter((filter): filter is FilterCondition => filter !== null);
}

function normalizeFilter(columns: QueryColumn[], filter: FilterCondition): FilterCondition | null {
  const column = findColumnByFilterField(columns, filter.field);
  if (!column?.filterOperators?.includes(filter.operator)) return null;

  if (VALUELESS_OPERATORS.includes(filter.operator)) return { ...filter, values: [] };

  // The form submits a blank input for a value the user never filled in; those are dropped
  // before the count check, so a half-filled range is rejected rather than compiled with
  // an empty bound.
  const values = filter.values.filter((value) => value !== "");
  const required = RANGE_OPERATORS.includes(filter.operator) ? 2 : 1;
  if (values.length < required) return null;

  if (DAY_COUNT_OPERATORS.includes(filter.operator)) {
    return values.every((value) => DAY_COUNT.test(value)) ? { ...filter, values } : null;
  }
  if (column.filterInput === "date" && DATE_VALUE_OPERATORS.includes(filter.operator)) {
    return values.every((value) => ISO_DATE.test(value)) ? { ...filter, values } : null;
  }
  if (column.filterInput === "number") {
    // FLOAT also accepts a bare integer, so one pattern covers both numeric filter types.
    return values.every((value) => FLOAT.test(value)) ? { ...filter, values } : null;
  }
  return { ...filter, values };
}
