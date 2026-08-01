import { pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { issueStatuses } from "./issue-statuses";
import { roles } from "./roles";
import { trackers } from "./trackers";

export const workflowFieldPermissionRuleEnum = ["readonly", "required"] as const;

export const workflowFieldPermissions = pgTable(
  "workflow_field_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackerId: uuid("tracker_id")
      .notNull()
      .references(() => trackers.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    statusId: uuid("status_id")
      .notNull()
      .references(() => issueStatuses.id, { onDelete: "cascade" }),
    fieldName: text("field_name").notNull(),
    rule: text("rule", { enum: workflowFieldPermissionRuleEnum }).notNull(),
  },
  (table) => [
    unique("workflow_field_permissions_scope_unique").on(
      table.trackerId,
      table.roleId,
      table.statusId,
      table.fieldName,
    ),
  ],
);
