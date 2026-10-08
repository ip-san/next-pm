ALTER TABLE "boards" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_parent_id_boards_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."boards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Boards gained a parent, so `position` is now ordered within (project, parent) rather than
-- within the project alone. Existing rows were numbered under the old scheme and can collide
-- or leave gaps once they are grouped by parent, so renumber them densely from 1 in their
-- current order, keeping the sequence stable by id where positions tie.
UPDATE "boards" b
SET "position" = s.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "project_id", "parent_id" ORDER BY "position", "id") AS rn
  FROM "boards"
) s
WHERE b."id" = s."id";
