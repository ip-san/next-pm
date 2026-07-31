import { doublePrecision, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { enumerations } from "./enumerations";
import { issues } from "./issues";
import { projects } from "./projects";
import { users } from "./users";

export const timeEntries = pgTable("time_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  activityId: uuid("activity_id")
    .notNull()
    .references(() => enumerations.id),
  hours: doublePrecision("hours").notNull(),
  comments: text("comments").notNull().default(""),
  spentOn: text("spent_on").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
