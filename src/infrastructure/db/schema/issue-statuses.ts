import { boolean, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

export const issueStatuses = pgTable("issue_statuses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  isClosed: boolean("is_closed").notNull().default(false),
  defaultDoneRatio: integer("default_done_ratio"),
  position: integer("position").notNull().default(0),
});
