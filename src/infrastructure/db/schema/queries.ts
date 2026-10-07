import { jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { roles } from "./roles";
import { users } from "./users";

export const queryVisibilityEnum = ["private", "roles", "public"] as const;

/**
 * Mirrors Redmine's single-table-inheritance `type` column on `queries` (IssueQuery,
 * TimeEntryQuery, ...). Only IssueQuery is implemented; the column exists so the global
 * cross-project lists and the time-entry list can reuse the same table and the same
 * domain/query code without a second migration.
 */
export const queryTypeEnum = ["IssueQuery", "TimeEntryQuery"] as const;

export const queries = pgTable("queries", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type", { enum: queryTypeEnum }).notNull().default("IssueQuery"),
  /** Null project_id means a global (cross-project) saved query, mirroring Redmine's Query. */
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  visibility: text("visibility", { enum: queryVisibilityEnum }).notNull().default("private"),
  /** Array of {field, operator, values} rows — compiled by domain/query/filter-builder.ts. */
  filters: jsonb("filters").notNull().default([]),
  /** Redmine's `column_names`: ordered list of column keys to display. Empty means "use the default set". */
  columnNames: jsonb("column_names").notNull().$type<string[]>().default([]),
  /** Redmine's `group_by`: a single groupable column key, or null for no grouping. */
  groupBy: text("group_by"),
  /** Redmine's `sort_criteria`: ordered [columnKey, "asc" | "desc"] pairs, at most 3 (Redmine's own cap). */
  sortCriteria: jsonb("sort_criteria").notNull().$type<[string, string][]>().default([]),
  /**
   * Redmine stores this inside the serialized `options` hash as `options[:totalable_names]`.
   * next-pm has no `options` blob, so it gets its own column: the list of totalable column
   * keys whose sum is shown in the totals row.
   */
  totalableNames: jsonb("totalable_names").notNull().$type<string[]>().default([]),
});

export const queriesRoles = pgTable(
  "queries_roles",
  {
    queryId: uuid("query_id")
      .notNull()
      .references(() => queries.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.queryId, table.roleId] })],
);
