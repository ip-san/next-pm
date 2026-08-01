import { pgTable, primaryKey, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { groups } from "./groups";
import { projects } from "./projects";
import { roles } from "./roles";
import { users } from "./users";

// A member row's principal is either a user or a group, never both — enforced in
// DrizzleMemberRepository.create rather than a DB CHECK constraint (matches this
// codebase's convention of app-level invariants over DB-level ones elsewhere).
// A group-principal row (groupId set) grants its role to every user in the group;
// that grant is materialized as one inherited row per user (inheritedFromMemberId
// pointing back to the group row), so every existing read path that already joins
// through `members` keeps working unchanged — see resolve-actor.ts.
export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
  inheritedFromMemberId: uuid("inherited_from_member_id").references((): AnyPgColumn => members.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
});

export const memberRoles = pgTable(
  "member_roles",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.memberId, table.roleId] })],
);
