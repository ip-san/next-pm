export type PermissionKey =
  | "view_project"
  | "edit_project"
  | "close_project"
  | "select_project_modules"
  | "manage_members"
  | "manage_versions"
  | "add_subprojects"
  | "save_queries"
  | "manage_public_queries"
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
  | "log_time_for_other_users"
  | "import_time_entries"
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
  | "manage_repository";

/**
 * Mirrors the `:require` option of Redmine's `map.permission` (lib/redmine/preparation.rb):
 * "member" means the permission is meaningless outside a project membership, "loggedin" means
 * it at least needs an account. `Role#setable_permissions` uses this to hide members-only
 * permissions from the builtin Non member role and logged-in-only ones from Anonymous.
 */
export type PermissionRequirement = "member" | "loggedin" | null;

interface PermissionDefinition {
  /** Module this permission belongs to; null means it's core (not gated by EnabledModule). */
  module: string | null;
  /**
   * Mirrors Redmine's `Redmine::AccessControl.read_action?` — read-only actions stay
   * allowed on closed (but not archived) projects; everything else requires an active project.
   */
  readOnly: boolean;
  /** Null when any principal, including an anonymous visitor, may hold the permission. */
  require: PermissionRequirement;
}

export const PERMISSION_REGISTRY: Record<PermissionKey, PermissionDefinition> = {
  view_project: { module: null, readOnly: true, require: null },
  edit_project: { module: null, readOnly: false, require: "member" },
  close_project: { module: null, readOnly: false, require: "member" },
  select_project_modules: { module: null, readOnly: false, require: "member" },
  manage_members: { module: null, readOnly: false, require: "member" },
  manage_versions: { module: null, readOnly: false, require: "member" },
  add_subprojects: { module: null, readOnly: false, require: "member" },

  // Redmine declares both outside any project module (lib/redmine/preparation.rb#L50), so
  // they stay available even on a project with issue tracking disabled — a saved query can
  // be a time-entry query too.
  save_queries: { module: null, readOnly: false, require: "loggedin" },
  manage_public_queries: { module: null, readOnly: false, require: "member" },

  view_issues: { module: "issue_tracking", readOnly: true, require: null },
  add_issues: { module: "issue_tracking", readOnly: false, require: null },
  edit_issues: { module: "issue_tracking", readOnly: false, require: null },
  edit_own_issues: { module: "issue_tracking", readOnly: false, require: null },
  set_issues_private: { module: "issue_tracking", readOnly: false, require: null },
  set_own_issues_private: { module: "issue_tracking", readOnly: false, require: "loggedin" },
  manage_subtasks: { module: "issue_tracking", readOnly: false, require: null },
  manage_issue_relations: { module: "issue_tracking", readOnly: false, require: null },
  manage_issue_categories: { module: "issue_tracking", readOnly: false, require: "member" },
  add_issue_watchers: { module: "issue_tracking", readOnly: false, require: null },
  delete_issue_watchers: { module: "issue_tracking", readOnly: false, require: null },

  view_time_entries: { module: "time_tracking", readOnly: true, require: null },
  log_time: { module: "time_tracking", readOnly: false, require: "loggedin" },
  edit_time_entries: { module: "time_tracking", readOnly: false, require: "member" },
  edit_own_time_entries: { module: "time_tracking", readOnly: false, require: "loggedin" },
  log_time_for_other_users: { module: "time_tracking", readOnly: false, require: "member" },
  import_time_entries: { module: "time_tracking", readOnly: false, require: null },

  view_wiki_pages: { module: "wiki", readOnly: true, require: null },
  edit_wiki_pages: { module: "wiki", readOnly: false, require: null },
  manage_wiki: { module: "wiki", readOnly: false, require: "member" },
  export_wiki_pages: { module: "wiki", readOnly: true, require: null },

  manage_boards: { module: "boards", readOnly: false, require: "member" },
  view_messages: { module: "boards", readOnly: true, require: null },
  add_messages: { module: "boards", readOnly: false, require: null },
  edit_messages: { module: "boards", readOnly: false, require: "member" },
  edit_own_messages: { module: "boards", readOnly: false, require: "loggedin" },
  delete_messages: { module: "boards", readOnly: false, require: "member" },
  delete_own_messages: { module: "boards", readOnly: false, require: "loggedin" },

  view_news: { module: "news", readOnly: true, require: null },
  manage_news: { module: "news", readOnly: false, require: "member" },
  comment_news: { module: "news", readOnly: false, require: null },
  view_documents: { module: "documents", readOnly: true, require: null },
  add_documents: { module: "documents", readOnly: false, require: "loggedin" },
  edit_documents: { module: "documents", readOnly: false, require: "loggedin" },
  delete_documents: { module: "documents", readOnly: false, require: "loggedin" },
  view_files: { module: "files", readOnly: true, require: null },
  manage_files: { module: "files", readOnly: false, require: "loggedin" },
  browse_repository: { module: "repository", readOnly: true, require: null },
  view_changesets: { module: "repository", readOnly: true, require: null },
  manage_repository: { module: "repository", readOnly: false, require: "member" },
};

export function isPermissionRegistered(key: string): key is PermissionKey {
  return key in PERMISSION_REGISTRY;
}
