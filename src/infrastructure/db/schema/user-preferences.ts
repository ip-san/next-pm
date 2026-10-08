import { boolean, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";
import { COMMENTS_SORTING_VALUES, type AutoWatchTrigger } from "@/domain/user-preferences/entity";

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  autoWatchOn: jsonb("auto_watch_on").notNull().$type<AutoWatchTrigger[]>().default([]),
  /** Redmine UserPreference#hide_mail, default true there too. */
  hideMail: boolean("hide_mail").notNull().default(true),
  /** IANA zone name, or null for the server's. Redmine stores an ActiveSupport zone name; a plain string either way. */
  timeZone: text("time_zone"),
  /** Redmine UserPreference#comments_sorting — the order issue history is rendered in. */
  commentsSorting: text("comments_sorting", { enum: COMMENTS_SORTING_VALUES }).notNull().default("asc"),
  /** Redmine UserPreference#no_self_notified, default true there too: don't mail me my own changes. */
  noSelfNotified: boolean("no_self_notified").notNull().default(true),
});
