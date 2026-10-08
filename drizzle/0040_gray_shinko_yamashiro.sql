ALTER TABLE "enumerations" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Backfill for the project-scoped view_members / view_calendar / view_gantt keys.
-- Redmine's view_members is granted wherever view_project is (public permission, no :require),
-- and calendar/gantt were under view_issues before they became their own modules, so roles
-- that could see issues keep seeing the calendar and gantt pages. Each key is appended only
-- when the role does not already hold it, so re-running the migration adds nothing.
UPDATE "roles" SET "permissions" = "permissions" || COALESCE(
  (SELECT jsonb_agg(k.key) FROM unnest(ARRAY['view_members']) AS k(key)
   WHERE NOT "roles"."permissions" @> to_jsonb(k.key)),
  '[]'::jsonb)
WHERE "permissions" @> '["view_project"]'::jsonb;--> statement-breakpoint
UPDATE "roles" SET "permissions" = "permissions" || COALESCE(
  (SELECT jsonb_agg(k.key) FROM unnest(ARRAY['view_calendar', 'view_gantt']) AS k(key)
   WHERE NOT "roles"."permissions" @> to_jsonb(k.key)),
  '[]'::jsonb)
WHERE "permissions" @> '["view_issues"]'::jsonb;--> statement-breakpoint
-- Redmine's 20100819172912 migration enables calendar and gantt for every project that has
-- issue_tracking. Insert each missing module row once.
INSERT INTO "enabled_modules" ("project_id", "name")
SELECT DISTINCT it."project_id", m."name"
FROM "enabled_modules" AS it
CROSS JOIN (VALUES ('calendar'), ('gantt')) AS m("name")
WHERE it."name" = 'issue_tracking'
  AND NOT EXISTS (
    SELECT 1 FROM "enabled_modules" AS x
    WHERE x."project_id" = it."project_id" AND x."name" = m."name"
  );
