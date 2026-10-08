-- Redmine's 20241103184550 changed the builtin roles (Non member and Anonymous) to
-- members_of_visible_projects. Before that they were 'all', which let an anonymous visitor
-- see every active user as a principal. Ordinary roles keep their own setting.
UPDATE "roles" SET "users_visibility" = 'members_of_visible_projects' WHERE "builtin" <> 0;
