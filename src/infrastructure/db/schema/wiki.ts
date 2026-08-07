import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { users } from "./users";

export const wikiPages = pgTable(
  "wiki_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => wikiPages.id, { onDelete: "set null" }),
    isProtected: boolean("is_protected").notNull().default(false),
  },
  (table) => [uniqueIndex("wiki_pages_project_title_unique").on(table.projectId, table.title)],
);

export const wikiRedirects = pgTable(
  "wiki_redirects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    redirectsToTitle: text("redirects_to_title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("wiki_redirects_project_title_unique").on(table.projectId, table.title)],
);

export const wikiContentVersions = pgTable(
  "wiki_content_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => wikiPages.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    text: text("text").notNull(),
    comments: text("comments").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("wiki_content_versions_page_version_unique").on(table.pageId, table.version)],
);
