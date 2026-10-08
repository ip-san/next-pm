-- import_issues is a new key. The issue import used to be gated on add_issues alone, so every role
-- that could add issues keeps the ability to import them. Redmine's IssueImport needs both keys.
-- Appends the key only where missing, so re-running the migration changes nothing.
UPDATE "roles" SET "permissions" = "permissions" || '["import_issues"]'::jsonb
WHERE "permissions" @> '["add_issues"]'::jsonb
  AND NOT "permissions" @> '["import_issues"]'::jsonb;
