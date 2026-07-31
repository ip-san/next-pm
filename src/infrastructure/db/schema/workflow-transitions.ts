import { boolean, pgTable, uuid } from "drizzle-orm/pg-core";
import { issueStatuses } from "./issue-statuses";
import { roles } from "./roles";
import { trackers } from "./trackers";

export const workflowTransitions = pgTable("workflow_transitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  trackerId: uuid("tracker_id")
    .notNull()
    .references(() => trackers.id, { onDelete: "cascade" }),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  oldStatusId: uuid("old_status_id")
    .notNull()
    .references(() => issueStatuses.id, { onDelete: "cascade" }),
  newStatusId: uuid("new_status_id")
    .notNull()
    .references(() => issueStatuses.id, { onDelete: "cascade" }),
  author: boolean("author").notNull().default(false),
  assignee: boolean("assignee").notNull().default(false),
});
