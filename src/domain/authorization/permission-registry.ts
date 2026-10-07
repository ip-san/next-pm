export type PermissionKey =
  | "view_project"
  | "add_project"
  | "edit_project"
  | "close_project"
  | "delete_project"
  | "select_project_publicity"
  | "select_project_modules"
  | "view_members"
  | "manage_members"
  | "manage_versions"
  | "add_subprojects"
  | "view_issues"
  | "add_issues"
  | "edit_issues"
  | "edit_own_issues"
  | "set_issues_private"
  | "set_own_issues_private"
  | "manage_subtasks"
  | "manage_issue_relations"
  | "manage_issue_categories"
  | "add_issue_watchers"
  | "delete_issue_watchers"
  | "view_time_entries"
  | "log_time"
  | "edit_time_entries"
  | "edit_own_time_entries"
  | "manage_project_activities"
  | "view_wiki_pages"
  | "edit_wiki_pages"
  | "manage_wiki"
  | "export_wiki_pages"
  | "manage_boards"
  | "view_messages"
  | "add_messages"
  | "edit_messages"
  | "edit_own_messages"
  | "delete_messages"
  | "delete_own_messages"
  | "view_news"
  | "manage_news"
  | "comment_news"
  | "view_documents"
  | "add_documents"
  | "edit_documents"
  | "delete_documents"
  | "view_files"
  | "manage_files"
  | "browse_repository"
  | "view_changesets"
  | "manage_repository"
  | "view_calendar"
  | "view_gantt";

interface PermissionDefinition {
  /** Module this permission belongs to; null means it's core (not gated by EnabledModule). */
  module: string | null;
  /**
   * Mirrors Redmine's `Redmine::AccessControl.read_action?` — read-only actions stay
   * allowed on closed (but not archived) projects; everything else requires an active project.
   */
  readOnly: boolean;
}

export const PERMISSION_REGISTRY: Record<PermissionKey, PermissionDefinition> = {
  view_project: { module: null, readOnly: true },
  add_project: { module: null, readOnly: false },
  edit_project: { module: null, readOnly: false },
  // Redmine marks close_project and delete_project `:read => true` so that a *closed*
  // project can still be reopened or deleted — a non-read permission would be denied by
  // the `!isActive` rule below and lock the project in place with no way out.
  close_project: { module: null, readOnly: true },
  delete_project: { module: null, readOnly: true },
  select_project_publicity: { module: null, readOnly: false },
  select_project_modules: { module: null, readOnly: false },
  view_members: { module: null, readOnly: true },
  manage_members: { module: null, readOnly: false },
  manage_versions: { module: null, readOnly: false },
  add_subprojects: { module: null, readOnly: false },

  view_issues: { module: "issue_tracking", readOnly: true },
  add_issues: { module: "issue_tracking", readOnly: false },
  edit_issues: { module: "issue_tracking", readOnly: false },
  edit_own_issues: { module: "issue_tracking", readOnly: false },
  set_issues_private: { module: "issue_tracking", readOnly: false },
  set_own_issues_private: { module: "issue_tracking", readOnly: false },
  manage_subtasks: { module: "issue_tracking", readOnly: false },
  manage_issue_relations: { module: "issue_tracking", readOnly: false },
  manage_issue_categories: { module: "issue_tracking", readOnly: false },
  add_issue_watchers: { module: "issue_tracking", readOnly: false },
  delete_issue_watchers: { module: "issue_tracking", readOnly: false },

  view_time_entries: { module: "time_tracking", readOnly: true },
  log_time: { module: "time_tracking", readOnly: false },
  edit_time_entries: { module: "time_tracking", readOnly: false },
  edit_own_time_entries: { module: "time_tracking", readOnly: false },
  manage_project_activities: { module: "time_tracking", readOnly: false },

  view_wiki_pages: { module: "wiki", readOnly: true },
  edit_wiki_pages: { module: "wiki", readOnly: false },
  manage_wiki: { module: "wiki", readOnly: false },
  export_wiki_pages: { module: "wiki", readOnly: true },

  manage_boards: { module: "boards", readOnly: false },
  view_messages: { module: "boards", readOnly: true },
  add_messages: { module: "boards", readOnly: false },
  edit_messages: { module: "boards", readOnly: false },
  edit_own_messages: { module: "boards", readOnly: false },
  delete_messages: { module: "boards", readOnly: false },
  delete_own_messages: { module: "boards", readOnly: false },

  view_news: { module: "news", readOnly: true },
  manage_news: { module: "news", readOnly: false },
  comment_news: { module: "news", readOnly: false },
  view_documents: { module: "documents", readOnly: true },
  add_documents: { module: "documents", readOnly: false },
  edit_documents: { module: "documents", readOnly: false },
  delete_documents: { module: "documents", readOnly: false },
  view_files: { module: "files", readOnly: true },
  manage_files: { module: "files", readOnly: false },
  browse_repository: { module: "repository", readOnly: true },
  view_changesets: { module: "repository", readOnly: true },
  manage_repository: { module: "repository", readOnly: false },
  view_calendar: { module: "calendar", readOnly: true },
  view_gantt: { module: "gantt", readOnly: true },
};

/**
 * Redmine's `Redmine::AccessControl.available_project_modules` — every module some
 * permission is gated on, in the order the project settings form lists them. Derived from
 * the registry rather than written out by hand would lose that order, so this stays an
 * explicit list and `permission-registry.test.ts` asserts the two agree.
 */
export const PROJECT_MODULES = [
  "issue_tracking",
  "time_tracking",
  "wiki",
  "boards",
  "news",
  "documents",
  "files",
  "repository",
  "calendar",
  "gantt",
] as const;

export type ProjectModule = (typeof PROJECT_MODULES)[number];

export function isPermissionRegistered(key: string): key is PermissionKey {
  return key in PERMISSION_REGISTRY;
}
