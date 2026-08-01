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

export type FieldPermissionRule = "readonly" | "required";

/**
 * Core `Issue` fields eligible for per (tracker, role, status) required/read-only control —
 * mirrors Redmine's `Tracker::CORE_FIELDS_ALL` (`app/models/tracker.rb`), narrowed to the
 * fields `IssueUpdate` actually allows changing. `statusId` itself is excluded: status
 * changes are governed by `WorkflowTransition`, not this mechanism. `parentId` is excluded
 * too — next-pm's update flow doesn't support reassigning a parent at all yet, so a
 * read-only/required rule for it would only ever matter at creation, which is out of scope
 * for this cycle. Custom fields are out of scope as well — `Issue` has no custom-field-value
 * slot to enforce against.
 */
export const WORKFLOW_ELIGIBLE_FIELDS = [
  "subject",
  "description",
  "assignedToId",
  "priorityId",
  "categoryId",
  "fixedVersionId",
  "startDate",
  "dueDate",
  "doneRatio",
  "estimatedHours",
  "isPrivate",
] as const;

export type WorkflowEligibleField = (typeof WORKFLOW_ELIGIBLE_FIELDS)[number];

/**
 * Mirrors Redmine's `WorkflowPermission` (STI sibling of `WorkflowTransition` sharing the
 * `workflows` table there; a separate table here). Keyed on (tracker, role, status, field).
 * Unlike the shared `old_status_id` column Redmine reuses from `WorkflowTransition`, `statusId`
 * here always means "the issue's status once this update is applied" — confirmed from
 * `Issue#safe_attributes=` (redmine/app/models/issue.rb#L620-636), which assigns `status_id`
 * from the submitted params *before* calling `delete_unsafe_attributes`, so
 * `workflow_rule_by_attribute`'s `status_id` lookup already reflects any status change in the
 * same request — there is no separate "old" vs "new" status axis for field permissions.
 */
export interface WorkflowFieldPermission {
  id: string;
  trackerId: string;
  roleId: string;
  statusId: string;
  fieldName: WorkflowEligibleField;
  rule: FieldPermissionRule;
}
