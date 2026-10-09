DROP INDEX "custom_values_unique_target";--> statement-breakpoint
ALTER TABLE "custom_fields" ADD COLUMN "multiple" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "custom_values_target" ON "custom_values" USING btree ("custom_field_id","customized_type","customized_id");