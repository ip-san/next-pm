-- Backfill for the newly introduced `set_issues_private` and `manage_subtasks` permissions.
--
-- Until now any role that could create or edit an issue could also mark it private and set
-- its parent, because neither was gated. Registering the permissions without this backfill
-- would silently take those abilities away from every existing role on upgrade. Redmine
-- handles the same situation the same way — see
-- db/migrate/20091114105931_add_view_issues_permission.rb, which grants the new key to every
-- existing role rather than letting the upgrade change behaviour.
--
-- `set_own_issues_private` is deliberately not granted: it is a strictly narrower variant
-- that no role previously had an equivalent of, and `set_issues_private` already covers
-- everything these roles could do before.

UPDATE "roles"
SET "permissions" = "permissions" || '["set_issues_private"]'::jsonb
WHERE NOT ("permissions" @> '["set_issues_private"]'::jsonb)
  AND ("permissions" @> '["add_issues"]'::jsonb OR "permissions" @> '["edit_issues"]'::jsonb);

UPDATE "roles"
SET "permissions" = "permissions" || '["manage_subtasks"]'::jsonb
WHERE NOT ("permissions" @> '["manage_subtasks"]'::jsonb)
  AND ("permissions" @> '["add_issues"]'::jsonb OR "permissions" @> '["edit_issues"]'::jsonb);
