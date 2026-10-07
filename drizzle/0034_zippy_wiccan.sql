ALTER TABLE "journals" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "journals" ADD COLUMN "updated_by_id" uuid;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Mirrors Redmine's own migration (20220714093000_add_journal_updated_on), which backfills
-- `updated_on = created_on` rather than leaving every existing note stamped with the
-- migration's run time. `updated_by_id` stays NULL, which is what "never edited" means —
-- the issue history only shows an edited marker once it is set.
UPDATE "journals" SET "updated_at" = "created_at";
