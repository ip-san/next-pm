-- Backfill for the newly introduced `add_issue_notes` permission.
--
-- Until now, adding a note was part of editing an issue: anyone with `edit_issues` could
-- note any issue in the project, and anyone with `edit_own_issues` could note their own.
-- Redmine splits note-adding out into its own permission with no "own" variant
-- (`Issue#notes_addable?` is a bare `add_issue_notes` check), so the two cases can't both
-- be preserved exactly.
--
-- Granting it to `edit_issues` roles escalates nothing — those users can already note every
-- issue in the project. Roles holding only `edit_own_issues` are deliberately left alone:
-- granting them `add_issue_notes` would widen them from "note my own issues" to "note every
-- issue in the project", and silently handing out a broader permission on upgrade is worse
-- than an admin having to grant it deliberately. Those roles lose note-adding until then.

UPDATE "roles"
SET "permissions" = "permissions" || '["add_issue_notes"]'::jsonb
WHERE NOT ("permissions" @> '["add_issue_notes"]'::jsonb)
  AND "permissions" @> '["edit_issues"]'::jsonb;
