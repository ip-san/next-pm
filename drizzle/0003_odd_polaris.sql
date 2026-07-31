CREATE TABLE "queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"project_id" uuid,
	"user_id" uuid NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"filters" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queries_roles" (
	"query_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "queries_roles_query_id_role_id_pk" PRIMARY KEY("query_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "queries" ADD CONSTRAINT "queries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queries" ADD CONSTRAINT "queries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queries_roles" ADD CONSTRAINT "queries_roles_query_id_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."queries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queries_roles" ADD CONSTRAINT "queries_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;