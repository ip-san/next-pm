CREATE TABLE "workflow_field_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracker_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"status_id" uuid NOT NULL,
	"field_name" text NOT NULL,
	"rule" text NOT NULL,
	CONSTRAINT "workflow_field_permissions_scope_unique" UNIQUE("tracker_id","role_id","status_id","field_name")
);
--> statement-breakpoint
ALTER TABLE "workflow_field_permissions" ADD CONSTRAINT "workflow_field_permissions_tracker_id_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_field_permissions" ADD CONSTRAINT "workflow_field_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_field_permissions" ADD CONSTRAINT "workflow_field_permissions_status_id_issue_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."issue_statuses"("id") ON DELETE cascade ON UPDATE no action;