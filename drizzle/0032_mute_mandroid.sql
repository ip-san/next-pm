ALTER TABLE "queries" ADD COLUMN "type" text DEFAULT 'IssueQuery' NOT NULL;--> statement-breakpoint
ALTER TABLE "queries" ADD COLUMN "column_names" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "queries" ADD COLUMN "group_by" text;--> statement-breakpoint
ALTER TABLE "queries" ADD COLUMN "sort_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "queries" ADD COLUMN "totalable_names" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "trackers" ADD COLUMN "disabled_core_fields" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Existing time entries have never been edited, so Redmine's `updated_on` for them is the
-- creation timestamp — not the moment this migration happened to run, which is what the
-- column default would otherwise leave behind.
UPDATE "time_entries" SET "updated_at" = "created_at";--> statement-breakpoint
-- Backfill for the newly introduced `save_queries` and `manage_public_queries`, in the same
-- spirit as 0030: saving a query used to be gated on `view_issues` and making one public on
-- `edit_issues`, so registering the real permissions without this would silently take those
-- abilities away from every existing role on upgrade.
--
-- The builtin roles are bounded by what Redmine's `:require` option allows them to hold:
-- `save_queries` is `:require => :loggedin`, so the Anonymous role (builtin 2) is excluded,
-- and `manage_public_queries` is `:require => :member`, so only ordinary roles (builtin 0)
-- are eligible. Granting either beyond that would produce a role holding a permission
-- `setablePermissions` no longer offers, which no admin could then remove through the UI.
UPDATE "roles"
SET "permissions" = "permissions" || '["save_queries"]'::jsonb
WHERE NOT ("permissions" @> '["save_queries"]'::jsonb)
  AND ("permissions" @> '["view_issues"]'::jsonb)
  AND "builtin" <> 2;--> statement-breakpoint
UPDATE "roles"
SET "permissions" = "permissions" || '["manage_public_queries"]'::jsonb
WHERE NOT ("permissions" @> '["manage_public_queries"]'::jsonb)
  AND ("permissions" @> '["edit_issues"]'::jsonb)
  AND "builtin" = 0;
