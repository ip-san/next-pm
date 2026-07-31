import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Polymorphic target discriminator ("Issue" | "Message" | "News") — same caveat as journals.journalizedType. */
  containerType: text("container_type").notNull(),
  containerId: uuid("container_id").notNull(),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  /** Client-supplied original filename — display only, never used to address the file on disk. */
  filename: text("filename").notNull(),
  /** Server-generated opaque key — the only value used to locate the file in storage. */
  storageKey: text("storage_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  fileSize: integer("file_size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
