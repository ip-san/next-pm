/**
 * Redmine's Query filter operators (query.rb `@@operators`), restricted to the ones that
 * apply to the filter types next-pm actually has (list / list_optional / list_status /
 * date / date_past / string / text / integer / float).
 *
 * Deliberately not ported: the relation operators (`=p` / `=!p` / `!p` / `*o` / `!o`), the
 * journal-history operators (`ev` / `!ev` / `cf`) and `*~` (contains any word) — all of them
 * need filter kinds (relation, tree, list_with_history) that next-pm's issue list has no
 * columns for yet.
 */
export const QUERY_FILTER_OPERATORS = [
  "=",
  "!",
  "!*",
  "*",
  ">=",
  "<=",
  "><",
  "~",
  "!~",
  "^",
  "$",
  "o",
  "c",
  "t",
  "ld",
  "nd",
  "w",
  "lw",
  "l2w",
  "nw",
  "m",
  "lm",
  "nm",
  "y",
  ">t-",
  "<t-",
  "><t-",
  "t-",
  ">t+",
  "<t+",
  "><t+",
  "t+",
] as const;

export type FilterOperator = (typeof QUERY_FILTER_OPERATORS)[number];

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  values: string[];
}

export type PredicateKind =
  | "eq"
  | "neq"
  | "isNull"
  | "isNotNull"
  | "gte"
  | "lte"
  | "between"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  /** Matches nothing — Redmine's `1=0` for `=` against an empty value set. */
  | "never";

export interface CompiledPredicate {
  field: string;
  kind: PredicateKind;
  values: string[];
}

/**
 * Everything the operator semantics need from outside the filter row itself. Redmine reads
 * the same things off `User.current` / `Setting` / a `SELECT ... FROM issue_statuses`
 * subquery at SQL-build time; injecting them here keeps compilation pure and testable, and
 * keeps `CompiledPredicate[]` free of anything the infrastructure layer has to interpret.
 */
export interface FilterContext {
  /** "Today" as an ISO yyyy-mm-dd date, in the frame the viewer's dates are stored in. */
  today: string;
  /** Resolves Redmine's magic `me` filter value. Null for an anonymous visitor. */
  userId: string | null;
  /** Status ids with is_closed = false — resolves the `o` operator without a subselect. */
  openStatusIds: string[];
  /** Status ids with is_closed = true — resolves the `c` operator. */
  closedStatusIds: string[];
  /**
   * First day of the week as a cwday number (1 = Monday … 7 = Sunday), mirroring Redmine's
   * `l(:general_first_day_of_week)`. Both its en and ja locales ship "7".
   */
  firstDayOfWeek: number;
}

export const DEFAULT_FIRST_DAY_OF_WEEK = 7;

/**
 * Builder pattern: turns raw (field, operator, values) filter rows — the shape a saved
 * Query's `filters` jsonb column and the issue-list query string both produce — into a
 * normalized, DB-agnostic predicate list. The infrastructure layer is responsible for
 * turning `CompiledPredicate[]` into actual Drizzle `and()/or()` expressions; this stays
 * pure so the operator semantics are unit-testable without a database.
 *
 * Conditions that Redmine resolves to `1=1` (a `!` against an empty value set) are dropped
 * rather than emitted, since an always-true clause has no effect on the final `and()`.
 */
export function compileFilters(conditions: FilterCondition[], context: FilterContext): CompiledPredicate[] {
  return conditions
    .map((condition) => compileFilter(condition, context))
    .filter((predicate): predicate is CompiledPredicate => predicate !== null);
}

function compileFilter(condition: FilterCondition, context: FilterContext): CompiledPredicate | null {
  const { field } = condition;
  const values = resolveMagicValues(condition.values, context);

  switch (condition.operator) {
    case "=":
      // Redmine turns `=` against an empty value set into `1=0` rather than silently
      // dropping the filter (query.rb#sql_for_field) — a saved query with no selected
      // value must not widen to "everything".
      return values.length === 0 ? { field, kind: "never", values: [] } : { field, kind: "eq", values };
    case "!":
      return values.length === 0 ? null : { field, kind: "neq", values };
    case "!*":
      return { field, kind: "isNull", values: [] };
    case "*":
      return { field, kind: "isNotNull", values: [] };
    case ">=":
      return { field, kind: "gte", values: [requireValue(condition, 0)] };
    case "<=":
      return { field, kind: "lte", values: [requireValue(condition, 0)] };
    case "><":
      return { field, kind: "between", values: [requireValue(condition, 0), requireValue(condition, 1)] };
    case "~":
      return { field, kind: "contains", values: [requireValue(condition, 0)] };
    case "!~":
      return { field, kind: "notContains", values: [requireValue(condition, 0)] };
    case "^":
      return { field, kind: "startsWith", values: [requireValue(condition, 0)] };
    case "$":
      return { field, kind: "endsWith", values: [requireValue(condition, 0)] };
    // Redmine resolves `o` / `c` with a `status_id IN (SELECT id FROM issue_statuses WHERE
    // is_closed = ?)` subquery, and emits nothing at all when the field isn't status_id
    // (query.rb's `when "o"` is guarded by `if field == "status_id"`). The equivalent id
    // list is already in the context, so this collapses to a plain IN and the
    // infrastructure layer needs no status join.
    case "o":
      return field === "status_id" ? idSetPredicate(field, context.openStatusIds) : null;
    case "c":
      return field === "status_id" ? idSetPredicate(field, context.closedStatusIds) : null;
    case "t":
      return relativeDays(field, context, 0, 0);
    case "ld":
      return relativeDays(field, context, -1, -1);
    case "nd":
      return relativeDays(field, context, 1, 1);
    case "w":
      return weekPredicate(field, context, 0);
    case "lw":
      return weekPredicate(field, context, -1);
    case "l2w":
      // Redmine's "last 2 weeks" ends yesterday-of-this-week, not at the end of last week.
      return relativeDays(field, context, -daysSinceStartOfWeek(context) - 14, -daysSinceStartOfWeek(context) - 1);
    case "nw":
      return weekPredicate(field, context, 1);
    case "m":
      return monthPredicate(field, context, 0);
    case "lm":
      return monthPredicate(field, context, -1);
    case "nm":
      return monthPredicate(field, context, 1);
    case "y":
      return { field, kind: "between", values: [`${context.today.slice(0, 4)}-01-01`, `${context.today.slice(0, 4)}-12-31`] };
    case "><t-":
      return relativeDays(field, context, -numberValue(condition, 0), 0);
    case ">t-":
      return relativeDays(field, context, -numberValue(condition, 0), null);
    case "<t-":
      return relativeDays(field, context, null, -numberValue(condition, 0));
    case "t-":
      return relativeDays(field, context, -numberValue(condition, 0), -numberValue(condition, 0));
    case "><t+":
      return relativeDays(field, context, 0, numberValue(condition, 0));
    case ">t+":
      return relativeDays(field, context, numberValue(condition, 0), null);
    case "<t+":
      return relativeDays(field, context, null, numberValue(condition, 0));
    case "t+":
      return relativeDays(field, context, numberValue(condition, 0), numberValue(condition, 0));
  }
}

/** Mirrors Redmine's `me` value, which `Query#values_for` swaps for `User.current.id`. */
function resolveMagicValues(values: string[], context: FilterContext): string[] {
  if (!values.includes("me")) return values;
  return values.flatMap((value) => (value === "me" ? (context.userId ? [context.userId] : []) : [value]));
}

function idSetPredicate(field: string, ids: string[]): CompiledPredicate {
  return ids.length === 0 ? { field, kind: "never", values: [] } : { field, kind: "eq", values: ids };
}

/**
 * Redmine's `relative_date_clause`: a half-open or closed range expressed in days either
 * side of today. A null bound means the range is open on that side.
 */
function relativeDays(field: string, context: FilterContext, from: number | null, to: number | null): CompiledPredicate {
  const fromDate = from === null ? null : addDays(context.today, from);
  const toDate = to === null ? null : addDays(context.today, to);
  if (fromDate !== null && toDate !== null) return { field, kind: "between", values: [fromDate, toDate] };
  if (fromDate !== null) return { field, kind: "gte", values: [fromDate] };
  if (toDate !== null) return { field, kind: "lte", values: [toDate] };
  return { field, kind: "isNotNull", values: [] };
}

function daysSinceStartOfWeek(context: FilterContext): number {
  const dayOfWeek = cwday(context.today);
  return dayOfWeek >= context.firstDayOfWeek ? dayOfWeek - context.firstDayOfWeek : dayOfWeek + 7 - context.firstDayOfWeek;
}

function weekPredicate(field: string, context: FilterContext, weekOffset: number): CompiledPredicate {
  const start = -daysSinceStartOfWeek(context) + weekOffset * 7;
  return relativeDays(field, context, start, start + 6);
}

function monthPredicate(field: string, context: FilterContext, monthOffset: number): CompiledPredicate {
  const [year, month] = context.today.split("-").map(Number);
  // Date.UTC normalizes month 0 / 13 into the neighbouring year by itself.
  const first = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  const last = new Date(Date.UTC(year, month + monthOffset, 0));
  return { field, kind: "between", values: [toIsoDate(first), toIsoDate(last)] };
}

/** ISO-8601 day of week: 1 = Monday … 7 = Sunday, matching Ruby's `Date#cwday`. */
function cwday(isoDate: string): number {
  const day = parseIsoDate(isoDate).getUTCDay();
  return day === 0 ? 7 : day;
}

function addDays(isoDate: string, days: number): string {
  const date = parseIsoDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function requireValue(condition: FilterCondition, index: number): string {
  const value = condition.values[index];
  if (value === undefined) {
    throw new Error(`Filter on "${condition.field}" with operator "${condition.operator}" is missing value #${index}`);
  }
  return value;
}

function numberValue(condition: FilterCondition, index: number): number {
  const parsed = Number(requireValue(condition, index));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Filter on "${condition.field}" with operator "${condition.operator}" needs a number, got "${condition.values[index]}"`);
  }
  return Math.trunc(parsed);
}
