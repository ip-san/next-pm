import { boolean, integer, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { issueStatuses } from "./issue-statuses";
import { projects } from "./projects";

export const trackers = pgTable("trackers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  defaultStatusId: uuid("default_status_id")
    .notNull()
    .references(() => issueStatuses.id),
  position: integer("position").notNull().default(0),
  isInRoadmap: boolean("is_in_roadmap").notNull().default(true),
});

export const projectTrackers = pgTable(
  "project_trackers",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    trackerId: uuid("tracker_id")
      .notNull()
      .references(() => trackers.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.trackerId] })],
);
