CREATE TABLE "custom_fields_roles" (
	"custom_field_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "custom_fields_roles_custom_field_id_role_id_pk" PRIMARY KEY("custom_field_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "custom_fields" ADD COLUMN "visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_fields_roles" ADD CONSTRAINT "custom_fields_roles_custom_field_id_custom_fields_id_fk" FOREIGN KEY ("custom_field_id") REFERENCES "public"."custom_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields_roles" ADD CONSTRAINT "custom_fields_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;