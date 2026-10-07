-- Backfill for the newly introduced `view_issue_watchers` permission.
--
-- Until now the watcher list was shown to anyone who could view the issue, so registering
-- the permission without this would quietly hide it from every existing role. Granting it
-- to roles that already hold `view_issues` preserves exactly what those users could see.
--
-- Redmine itself shipped this permission without a migration, which silently removed the
-- list from existing roles on upgrade. next-pm's convention (see 0030) is to preserve
-- behaviour, so this deviates deliberately — it grants no access that wasn't already there.

UPDATE "roles"
SET "permissions" = "permissions" || '["view_issue_watchers"]'::jsonb
WHERE NOT ("permissions" @> '["view_issue_watchers"]'::jsonb)
  AND "permissions" @> '["view_issues"]'::jsonb;
