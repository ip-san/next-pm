CREATE TABLE "enabled_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"default_done_ratio" integer,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "issue_statuses_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "project_trackers" (
	"project_id" uuid NOT NULL,
	"tracker_id" uuid NOT NULL,
	CONSTRAINT "project_trackers_project_id_tracker_id_pk" PRIMARY KEY("project_id","tracker_id")
);
--> statement-breakpoint
CREATE TABLE "trackers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"default_status_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_in_roadmap" boolean DEFAULT true NOT NULL,
	CONSTRAINT "trackers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "lft" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "rgt" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "enabled_modules" ADD CONSTRAINT "enabled_modules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_trackers" ADD CONSTRAINT "project_trackers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_trackers" ADD CONSTRAINT "project_trackers_tracker_id_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackers" ADD CONSTRAINT "trackers_default_status_id_issue_statuses_id_fk" FOREIGN KEY ("default_status_id") REFERENCES "public"."issue_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_parent_id_projects_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;