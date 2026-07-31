import { boolean, integer, pgTable, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { enumerations } from "./enumerations";
import { issueCategories } from "./issue-categories";
import { issueStatuses } from "./issue-statuses";
import { projects } from "./projects";
import { trackers } from "./trackers";
import { users } from "./users";
import { versions } from "./versions";

export const issues = pgTable("issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  trackerId: uuid("tracker_id")
    .notNull()
    .references(() => trackers.id),
  statusId: uuid("status_id")
    .notNull()
    .references(() => issueStatuses.id),
  priorityId: uuid("priority_id")
    .notNull()
    .references(() => enumerations.id),
  subject: text("subject").notNull(),
  description: text("description").notNull().default(""),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  assignedToId: uuid("assigned_to_id").references(() => users.id),
  /** Adjacency-list subtask tree (not a nested set) — matches the plan's simplification of Redmine's issue side. */
  parentId: uuid("parent_id").references((): AnyPgColumn => issues.id, { onDelete: "set null" }),
  fixedVersionId: uuid("fixed_version_id").references(() => versions.id, { onDelete: "set null" }),
  categoryId: uuid("category_id").references(() => issueCategories.id),
  isPrivate: boolean("is_private").notNull().default(false),
  doneRatio: integer("done_ratio").notNull().default(0),
  estimatedHours: integer("estimated_hours"),
  startDate: text("start_date"),
  dueDate: text("due_date"),
  lockVersion: integer("lock_version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
