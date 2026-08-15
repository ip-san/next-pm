import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const reactions = pgTable(
  "reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reactableType: text("reactable_type").notNull(),
    reactableId: uuid("reactable_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("reactions_unique_target").on(table.reactableType, table.reactableId, table.userId)],
);
