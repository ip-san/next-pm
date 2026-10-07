ALTER TABLE "attachments" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "downloads" integer DEFAULT 0 NOT NULL;