/**
 * Redmine's Query filter operators (query.rb) reduced to the subset needed for issue
 * list filtering: equals/not-equals, is-empty/is-not-empty, numeric range, and
 * contains/not-contains for text search.
 */
export type FilterOperator = "=" | "!" | "!*" | "*" | ">=" | "<=" | "><" | "~" | "!~";

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
  | "notContains";

export interface CompiledPredicate {
  field: string;
  kind: PredicateKind;
  values: string[];
}

/**
 * Builder pattern: turns raw (field, operator, values) filter rows — the shape a saved
 * Query's `filters` jsonb column and the issue-list query string both produce — into a
 * normalized, DB-agnostic predicate list. The infrastructure layer is responsible for
 * turning `CompiledPredicate[]` into actual Drizzle `and()/or()` expressions; this stays
 * pure so the operator semantics are unit-testable without a database.
 */
export function compileFilters(conditions: FilterCondition[]): CompiledPredicate[] {
  return conditions.map(compileFilter);
}

function compileFilter(condition: FilterCondition): CompiledPredicate {
  switch (condition.operator) {
    case "=":
      return { field: condition.field, kind: "eq", values: condition.values };
    case "!":
      return { field: condition.field, kind: "neq", values: condition.values };
    case "!*":
      return { field: condition.field, kind: "isNull", values: [] };
    case "*":
      return { field: condition.field, kind: "isNotNull", values: [] };
    case ">=":
      return { field: condition.field, kind: "gte", values: [requireValue(condition, 0)] };
    case "<=":
      return { field: condition.field, kind: "lte", values: [requireValue(condition, 0)] };
    case "><":
      return { field: condition.field, kind: "between", values: [requireValue(condition, 0), requireValue(condition, 1)] };
    case "~":
      return { field: condition.field, kind: "contains", values: [requireValue(condition, 0)] };
    case "!~":
      return { field: condition.field, kind: "notContains", values: [requireValue(condition, 0)] };
  }
}

function requireValue(condition: FilterCondition, index: number): string {
  const value = condition.values[index];
  if (value === undefined) {
    throw new Error(`Filter on "${condition.field}" with operator "${condition.operator}" is missing value #${index}`);
  }
  return value;
}
