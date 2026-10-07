import { boolean, integer, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import type { TrackerCoreField } from "@/domain/tracker/core-fields";
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
  /**
   * Standard issue fields this tracker switches off — Redmine's `Tracker::CORE_FIELDS`
   * (see domain/tracker/core-fields.ts). Redmine packs this into a `fields_bits` integer whose
   * bit positions are the CORE_FIELDS array's indexes, which is why its model comments warn
   * never to insert into that array; storing the names instead keeps the column readable and
   * the field order free to change.
   */
  disabledCoreFields: jsonb("disabled_core_fields").notNull().$type<TrackerCoreField[]>().default([]),
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
