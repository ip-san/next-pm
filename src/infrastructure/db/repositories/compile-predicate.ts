import { and, between, eq, gte, inArray, isNotNull, isNull, like, lte, ne, not, notInArray, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { CompiledPredicate } from "@/domain/query/filter-builder";

/**
 * Infrastructure-side half of the Builder pattern: turns the DB-agnostic
 * `CompiledPredicate[]` from domain/query/filter-builder.ts into a single Drizzle `and()`
 * expression, given a map of filter field name -> actual column.
 */
export function toDrizzleCondition(
  predicates: CompiledPredicate[],
  columnsByField: Record<string, AnyPgColumn>,
): SQL | undefined {
  const clauses = predicates
    .map((predicate) => {
      const column = columnsByField[predicate.field];
      if (!column) return undefined;

      switch (predicate.kind) {
        case "eq":
          // Redmine's "=" operator accepts a list (status_id=1|2|3) — matches OR-across-values.
          return predicate.values.length > 1 ? inArray(column, predicate.values) : eq(column, predicate.values[0]);
        case "neq":
          return predicate.values.length > 1 ? notInArray(column, predicate.values) : ne(column, predicate.values[0]);
        case "isNull":
          return isNull(column);
        case "isNotNull":
          return isNotNull(column);
        case "gte":
          return gte(column, predicate.values[0]);
        case "lte":
          return lte(column, predicate.values[0]);
        case "between":
          return between(column, predicate.values[0], predicate.values[1]);
        case "contains":
          return like(column, `%${predicate.values[0]}%`);
        case "notContains":
          return not(like(column, `%${predicate.values[0]}%`));
        default:
          return undefined;
      }
    })
    .filter((clause): clause is SQL => clause !== undefined);

  return clauses.length > 0 ? and(...clauses) : undefined;
}
