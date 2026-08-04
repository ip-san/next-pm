CREATE TABLE "twofa_backup_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "twofa_scheme" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "twofa_totp_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "twofa_totp_last_used_step" integer;--> statement-breakpoint
ALTER TABLE "twofa_backup_codes" ADD CONSTRAINT "twofa_backup_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;