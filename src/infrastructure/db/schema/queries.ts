import { jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { roles } from "./roles";
import { users } from "./users";

export const queryVisibilityEnum = ["private", "roles", "public"] as const;

export const queries = pgTable("queries", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Null project_id means a global (cross-project) saved query, mirroring Redmine's Query. */
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  visibility: text("visibility", { enum: queryVisibilityEnum }).notNull().default("private"),
  /** Array of {field, operator, values} rows — compiled by domain/query/filter-builder.ts. */
  filters: jsonb("filters").notNull().default([]),
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
