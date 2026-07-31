/**
 * Mirrors Redmine's `workflows` table (WorkflowTransition rows) — keyed on
 * (tracker, role, old_status) -> new_status, confirmed from
 * redmine/db/migrate/001_setup.rb + 20110220160626_add_workflows_assignee_and_author.rb.
 * `author`/`assignee` are unlock flags: the transition is additionally available to the
 * issue's author/assignee even when their role alone wouldn't grant it.
 */
export interface WorkflowTransition {
  id: string;
  trackerId: string;
  roleId: string;
  oldStatusId: string;
  newStatusId: string;
  author: boolean;
  assignee: boolean;
}
