import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  /**
   * Polymorphic target discriminator ("Issue" | "Message" | "News" | "Document") — same caveat
   * as journals.journalizedType. Null together with containerId for a pending upload (created
   * via POST /api/v1/uploads) that hasn't been attached to anything yet.
   */
  containerType: text("container_type"),
  containerId: uuid("container_id"),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  /** Client-supplied original filename — display only, never used to address the file on disk. */
  filename: text("filename").notNull(),
  /** Server-generated opaque key — the only value used to locate the file in storage. */
  storageKey: text("storage_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  fileSize: integer("file_size").notNull(),
  /** SHA-256 hex digest of the file content — the second half of the upload token (id.digest). */
  digest: text("digest").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
