import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { issues } from "./issues";

export const relationTypeEnum = ["relates", "duplicates", "blocks", "precedes", "copied_to"] as const;

export const issueRelations = pgTable("issue_relations", {
  id: uuid("id").primaryKey().defaultRandom(),
  issueFromId: uuid("issue_from_id")
    .notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  issueToId: uuid("issue_to_id")
    .notNull()
    .references(() => issues.id, { onDelete: "cascade" }),
  relationType: text("relation_type", { enum: relationTypeEnum }).notNull(),
  delay: integer("delay"),
});
