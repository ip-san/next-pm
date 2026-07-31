CREATE TABLE "custom_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"field_format" text NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"default_value" text,
	"possible_values" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_fields_trackers" (
	"custom_field_id" uuid NOT NULL,
	"tracker_id" uuid NOT NULL,
	CONSTRAINT "custom_fields_trackers_custom_field_id_tracker_id_pk" PRIMARY KEY("custom_field_id","tracker_id")
);
--> statement-breakpoint
CREATE TABLE "custom_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"custom_field_id" uuid NOT NULL,
	"customized_type" text NOT NULL,
	"customized_id" uuid NOT NULL,
	"value" text
);
--> statement-breakpoint
ALTER TABLE "custom_fields_trackers" ADD CONSTRAINT "custom_fields_trackers_custom_field_id_custom_fields_id_fk" FOREIGN KEY ("custom_field_id") REFERENCES "public"."custom_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields_trackers" ADD CONSTRAINT "custom_fields_trackers_tracker_id_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_values" ADD CONSTRAINT "custom_values_custom_field_id_custom_fields_id_fk" FOREIGN KEY ("custom_field_id") REFERENCES "public"."custom_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_values_unique_target" ON "custom_values" USING btree ("custom_field_id","customized_type","customized_id");