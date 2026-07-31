import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const jobStatusEnum = ["pending", "processing", "done", "failed"] as const;

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobType: text("job_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status", { enum: jobStatusEnum }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
