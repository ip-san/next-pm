import { jsonb, pgTable, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";
import type { AutoWatchTrigger } from "@/domain/user-preferences/entity";

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  autoWatchOn: jsonb("auto_watch_on").notNull().$type<AutoWatchTrigger[]>().default([]),
});
