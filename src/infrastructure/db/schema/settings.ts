import { pgTable, text } from "drizzle-orm/pg-core";

export const settings = pgTable("settings", {
  name: text("name").primaryKey(),
  value: text("value").notNull(),
});
