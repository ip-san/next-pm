CREATE TABLE "changeset_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"changeset_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	CONSTRAINT "changeset_issues_unique" UNIQUE("changeset_id","issue_id")
);
--> statement-breakpoint
CREATE TABLE "changesets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scm_repository_id" uuid NOT NULL,
	"revision" text NOT NULL,
	"committer_identity" text NOT NULL,
	"committed_on" timestamp with time zone NOT NULL,
	"comments" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "changesets_repository_revision_unique" UNIQUE("scm_repository_id","revision")
);
--> statement-breakpoint
ALTER TABLE "scm_repositories" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "changeset_issues" ADD CONSTRAINT "changeset_issues_changeset_id_changesets_id_fk" FOREIGN KEY ("changeset_id") REFERENCES "public"."changesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changeset_issues" ADD CONSTRAINT "changeset_issues_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changesets" ADD CONSTRAINT "changesets_scm_repository_id_scm_repositories_id_fk" FOREIGN KEY ("scm_repository_id") REFERENCES "public"."scm_repositories"("id") ON DELETE cascade ON UPDATE no action;