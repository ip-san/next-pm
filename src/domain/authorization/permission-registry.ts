export type PermissionKey =
  | "view_project"
  | "edit_project"
  | "close_project"
  | "select_project_modules"
  | "manage_members"
  | "manage_versions"
  | "add_subprojects"
  | "view_issues"
  | "add_issues"
  | "edit_issues"
  | "edit_own_issues"
  | "manage_issue_relations"
  | "manage_issue_categories"
  | "view_time_entries"
  | "log_time"
  | "edit_time_entries"
  | "edit_own_time_entries"
  | "view_wiki_pages"
  | "edit_wiki_pages"
  | "manage_wiki"
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
  | "manage_documents"
  | "view_files"
  | "manage_files"
  | "manage_repository";

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
  edit_project: { module: null, readOnly: false },
  close_project: { module: null, readOnly: false },
  select_project_modules: { module: null, readOnly: false },
  manage_members: { module: null, readOnly: false },
  manage_versions: { module: null, readOnly: false },
  add_subprojects: { module: null, readOnly: false },

  view_issues: { module: "issue_tracking", readOnly: true },
  add_issues: { module: "issue_tracking", readOnly: false },
  edit_issues: { module: "issue_tracking", readOnly: false },
  edit_own_issues: { module: "issue_tracking", readOnly: false },
  manage_issue_relations: { module: "issue_tracking", readOnly: false },
  manage_issue_categories: { module: "issue_tracking", readOnly: false },

  view_time_entries: { module: "time_tracking", readOnly: true },
  log_time: { module: "time_tracking", readOnly: false },
  edit_time_entries: { module: "time_tracking", readOnly: false },
  edit_own_time_entries: { module: "time_tracking", readOnly: false },

  view_wiki_pages: { module: "wiki", readOnly: true },
  edit_wiki_pages: { module: "wiki", readOnly: false },
  manage_wiki: { module: "wiki", readOnly: false },

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
  manage_documents: { module: "documents", readOnly: false },
  view_files: { module: "files", readOnly: true },
  manage_files: { module: "files", readOnly: false },
  manage_repository: { module: "repository", readOnly: false },
};

export function isPermissionRegistered(key: string): key is PermissionKey {
  return key in PERMISSION_REGISTRY;
}
