CREATE SEQUENCE IF NOT EXISTS "issues_number_seq";--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "number" integer;--> statement-breakpoint
-- Existing issues are numbered in the order they were created, so the numbers read the way the history does.
UPDATE "issues" SET "number" = numbered.rn FROM (SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS rn FROM "issues") AS numbered WHERE "issues"."id" = numbered."id";--> statement-breakpoint
SELECT setval('issues_number_seq', COALESCE((SELECT max("number") FROM "issues"), 0) + 1, false);--> statement-breakpoint
ALTER TABLE "issues" ALTER COLUMN "number" SET DEFAULT nextval('issues_number_seq');--> statement-breakpoint
ALTER TABLE "issues" ALTER COLUMN "number" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "issues_number_key" ON "issues" ("number");
