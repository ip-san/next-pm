import { boolean, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { PermissionKey } from "@/domain/authorization/permission-registry";
import type { IssuesVisibility, TimeEntriesVisibility, UsersVisibility } from "@/domain/role/entity";

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** 0 = ordinary member role, 1 = builtin Non-member, 2 = builtin Anonymous (Redmine's Role::BUILTIN_*). */
  builtin: integer("builtin").notNull().default(0),
  position: integer("position").notNull().default(0),
  permissions: jsonb("permissions").notNull().$type<PermissionKey[]>().default([]),
  issuesVisibility: text("issues_visibility").notNull().default("default").$type<IssuesVisibility>(),
  timeEntriesVisibility: text("time_entries_visibility").notNull().default("all").$type<TimeEntriesVisibility>(),
  usersVisibility: text("users_visibility").notNull().default("all").$type<UsersVisibility>(),
  assignable: boolean("assignable").notNull().default(true),
});
