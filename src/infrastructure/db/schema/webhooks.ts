import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { users } from "./users";
import type { WebhookEvent } from "@/domain/webhook/events";

/** Mirrors Redmine 6.1's `webhooks` table; `events` is a jsonb array, as roles.permissions is. */
export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  /** Empty means "don't sign"; Redmine's column is nullable with the same meaning. */
  secret: text("secret").notNull().default(""),
  events: jsonb("events").notNull().$type<WebhookEvent[]>().default([]),
  active: boolean("active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Redmine's projects_webhooks habtm join. */
export const webhookProjects = pgTable(
  "webhook_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("webhook_projects_unique").on(table.webhookId, table.projectId)],
);
