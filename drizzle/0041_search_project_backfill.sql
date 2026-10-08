-- search_project is a new key. Search used to be gated on view_project alone (the project and
-- global search pages and the REST search routes), and Redmine declares search_project as a
-- public read permission, so every role that could already view a project can search it.
-- Appends the key only where missing, so re-running the migration changes nothing.
UPDATE "roles" SET "permissions" = "permissions" || '["search_project"]'::jsonb
WHERE "permissions" @> '["view_project"]'::jsonb
  AND NOT "permissions" @> '["search_project"]'::jsonb;
