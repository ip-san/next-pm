CREATE TABLE "wikis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"start_page" text DEFAULT 'Wiki' NOT NULL,
	CONSTRAINT "wikis_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "wikis" ADD CONSTRAINT "wikis_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Wiki permission split (worktree-agent-ad720f8046c6279ce). Behaviour-preserving
-- grants: each new key goes to roles that held the key that used to gate it.
-- history/diff/activity moved from view_wiki_pages to view_wiki_edits
UPDATE "roles" SET "permissions" = "permissions" || '["view_wiki_edits"]'::jsonb
WHERE ("permissions" @> '["view_wiki_pages"]'::jsonb) AND NOT ("permissions" @> '["view_wiki_edits"]'::jsonb);
--> statement-breakpoint
-- renaming moved from edit_wiki_pages to rename_wiki_pages
UPDATE "roles" SET "permissions" = "permissions" || '["rename_wiki_pages"]'::jsonb
WHERE ("permissions" @> '["edit_wiki_pages"]'::jsonb) AND NOT ("permissions" @> '["rename_wiki_pages"]'::jsonb) AND "builtin" = 0;
--> statement-breakpoint
-- deleting an attachment moved from edit_wiki_pages to delete_wiki_pages_attachments
UPDATE "roles" SET "permissions" = "permissions" || '["delete_wiki_pages_attachments"]'::jsonb
WHERE ("permissions" @> '["edit_wiki_pages"]'::jsonb) AND NOT ("permissions" @> '["delete_wiki_pages_attachments"]'::jsonb);
--> statement-breakpoint
-- the REST page DELETE was gated on manage_wiki; it moves to delete_wiki_pages
UPDATE "roles" SET "permissions" = "permissions" || '["delete_wiki_pages"]'::jsonb
WHERE ("permissions" @> '["manage_wiki"]'::jsonb) AND NOT ("permissions" @> '["delete_wiki_pages"]'::jsonb) AND "builtin" = 0;
-- Bounds verified against preparation.rb: rename_wiki_pages (L128), delete_wiki_pages
-- (L129) and protect_wiki_pages (L134) are `:require => :member`, so those grants stay on
-- builtin = 0. delete_wiki_pages_attachments (L130) carries no `:require` at all, so its
-- builtin bound was dropped — keeping it would have been narrower than Redmine permits and
-- would have taken the ability away from a non-member role that holds edit_wiki_pages.
-- view_wiki_edits (L125) is `:read => true` with no `:require`, so it is unbounded too.
