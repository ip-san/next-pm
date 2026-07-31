import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const watchers = pgTable(
  "watchers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    watchableType: text("watchable_type").notNull(),
    watchableId: uuid("watchable_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("watchers_unique_target").on(table.watchableType, table.watchableId, table.userId)],
);
