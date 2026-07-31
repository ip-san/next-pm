CREATE TABLE "issue_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"assigned_to_id" uuid
);
--> statement-breakpoint
CREATE TABLE "issue_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_from_id" uuid NOT NULL,
	"issue_to_id" uuid NOT NULL,
	"relation_type" text NOT NULL,
	"delay" integer
);
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "issue_categories" ADD CONSTRAINT "issue_categories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_categories" ADD CONSTRAINT "issue_categories_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_issue_from_id_issues_id_fk" FOREIGN KEY ("issue_from_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_issue_to_id_issues_id_fk" FOREIGN KEY ("issue_to_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_category_id_issue_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."issue_categories"("id") ON DELETE no action ON UPDATE no action;