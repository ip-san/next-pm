CREATE TABLE "my_page_layouts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"layout" jsonb NOT NULL,
	"block_settings" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "my_page_layouts" ADD CONSTRAINT "my_page_layouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;