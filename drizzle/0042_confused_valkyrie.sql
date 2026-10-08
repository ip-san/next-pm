ALTER TABLE "scm_repositories" DROP CONSTRAINT "scm_repositories_project_unique";--> statement-breakpoint
ALTER TABLE "changesets" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "scm_repositories" ADD COLUMN "identifier" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "scm_repositories" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "changesets" ADD CONSTRAINT "changesets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "changesets_repository_committer_idx" ON "changesets" USING btree ("scm_repository_id","committer_identity");--> statement-breakpoint
CREATE UNIQUE INDEX "scm_repositories_project_default_unique" ON "scm_repositories" USING btree ("project_id") WHERE "scm_repositories"."is_default";--> statement-breakpoint
ALTER TABLE "scm_repositories" ADD CONSTRAINT "scm_repositories_project_identifier_unique" UNIQUE("project_id","identifier");--> statement-breakpoint
-- Before this migration a project had at most one repository, so each existing row becomes its
-- project's default (the one served at the bare /repository path). The partial unique index
-- above already holds: one default per project.
UPDATE "scm_repositories" SET "is_default" = true;
