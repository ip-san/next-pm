ALTER TABLE "users" ADD COLUMN "atom_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_atom_key_unique" UNIQUE("atom_key");