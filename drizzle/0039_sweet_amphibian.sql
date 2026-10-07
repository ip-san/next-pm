ALTER TABLE "enumerations" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Redmine's `enumerations.active`. The column default backfills every existing row to
-- active, which is what they all effectively were, so nothing further is needed for it.
--
-- The rest of this migration backfills the permissions and modules this branch registers.
-- Same convention as 0030 and 0035: registering a key without a backfill silently takes an
-- ability away from every existing role on upgrade, so each statement below grants exactly
-- what the affected users could already do and nothing more. All three permissions carry no
-- `:require` in preparation.rb, so they are setable on the builtin Non member and Anonymous
-- roles too and are deliberately not excluded here.

-- `view_members` is `:public => true` in Redmine — granted to every principal regardless of
-- role, a concept this registry has no equivalent for. Until now the project overview's
-- members box was shown to anyone who could see the project, so granting the key to roles
-- that already hold `view_project` preserves exactly that.
UPDATE "roles"
SET "permissions" = "permissions" || '["view_members"]'::jsonb
WHERE NOT ("permissions" @> '["view_members"]'::jsonb)
  AND "permissions" @> '["view_project"]'::jsonb;--> statement-breakpoint

-- The calendar and Gantt pages (and the Gantt PDF) were gated on `view_issues` alone before
-- they had modules and permissions of their own.
UPDATE "roles"
SET "permissions" = "permissions" || '["view_calendar"]'::jsonb
WHERE NOT ("permissions" @> '["view_calendar"]'::jsonb)
  AND "permissions" @> '["view_issues"]'::jsonb;--> statement-breakpoint

UPDATE "roles"
SET "permissions" = "permissions" || '["view_gantt"]'::jsonb
WHERE NOT ("permissions" @> '["view_gantt"]'::jsonb)
  AND "permissions" @> '["view_issues"]'::jsonb;--> statement-breakpoint

-- Same reasoning on the module side: reaching either page required `view_issues`, which
-- requires `issue_tracking`, so enabling the two new modules exactly where issue tracking is
-- already on preserves who could reach them. A project that had issue tracking off could not
-- reach either page before and still cannot.
INSERT INTO "enabled_modules" ("project_id", "name")
SELECT em."project_id", m."name"
FROM "enabled_modules" em
CROSS JOIN (VALUES ('calendar'), ('gantt')) AS m("name")
WHERE em."name" = 'issue_tracking'
  AND NOT EXISTS (
    SELECT 1 FROM "enabled_modules" x
    WHERE x."project_id" = em."project_id" AND x."name" = m."name"
  );
