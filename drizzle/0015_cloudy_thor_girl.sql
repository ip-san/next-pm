ALTER TABLE "issues" DROP CONSTRAINT "issues_assigned_to_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "assigned_to_type" text;
--> statement-breakpoint
UPDATE "issues" SET "assigned_to_type" = 'user' WHERE "assigned_to_id" IS NOT NULL;