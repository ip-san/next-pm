ALTER TABLE "attachments" ALTER COLUMN "container_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "container_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "digest" text;--> statement-breakpoint
-- Existing rows predate the digest column and their real content may no longer be on disk to
-- re-hash; backfill with a sentinel so the NOT NULL below can apply. Harmless: digest is only
-- ever compared for pending (container-less) uploads, and any row old enough to hit this backfill
-- already has a container.
UPDATE "attachments" SET "digest" = 'backfilled-no-digest' WHERE "digest" IS NULL;--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "digest" SET NOT NULL;