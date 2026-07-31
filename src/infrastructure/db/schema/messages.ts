import { boolean, integer, pgTable, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { boards } from "./boards";
import { users } from "./users";

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  boardId: uuid("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => messages.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  subject: text("subject").notNull(),
  content: text("content").notNull(),
  locked: boolean("locked").notNull().default(false),
  sticky: boolean("sticky").notNull().default(false),
  repliesCount: integer("replies_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
