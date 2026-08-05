import { jsonb, pgTable, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const myPageLayouts = pgTable("my_page_layouts", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** { top: MyPageBlockType[], left: [...], right: [...] } — see domain/my-page/entity.ts. */
  layout: jsonb("layout").notNull(),
  /** Keyed by block type, e.g. { timelog: { days: 14 } } — mirrors Redmine's my_page_settings. */
  blockSettings: jsonb("block_settings").notNull().default({}),
});
