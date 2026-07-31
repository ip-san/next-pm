CREATE TABLE "scm_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"root_path" text NOT NULL,
	CONSTRAINT "scm_repositories_project_unique" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "scm_repositories" ADD CONSTRAINT "scm_repositories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;