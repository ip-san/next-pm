import type { Issue } from "@/domain/issue/entity";
import { parseCustomFieldKey, type QueryColumn } from "@/domain/query/columns";

/** Id -> display name maps for every association an issue column can render. */
export interface IssueListLookups {
  statuses: Map<string, string>;
  trackers: Map<string, string>;
  priorities: Map<string, string>;
  users: Map<string, string>;
  groups: Map<string, string>;
  categories: Map<string, string>;
  versions: Map<string, string>;
}

export interface IssueRowContext {
  lookups: IssueListLookups;
  /** Keyed `${issueId}:${customFieldId}`, as the search repository returns it. */
  customValues: Map<string, string>;
  spentHours: Map<string, number>;
}

function assigneeName(issue: Issue, lookups: IssueListLookups): string {
  if (!issue.assignedToId) return "";
  return (issue.assignedToType === "group" ? lookups.groups.get(issue.assignedToId) : lookups.users.get(issue.assignedToId)) ?? "";
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Renders one cell. Shared by the HTML table and the CSV export so a column's exported
 * value can never drift from what the list showed — the brief's "CSV export respects
 * selected columns" only means anything if both read the same function.
 */
export function issueColumnValue(column: QueryColumn, issue: Issue, context: IssueRowContext): string {
  const customFieldId = parseCustomFieldKey(column.key);
  if (customFieldId) {
    return context.customValues.get(`${issue.id}:${customFieldId}`) ?? "";
  }

  switch (column.key) {
    case "id":
      return issue.id.slice(0, 8);
    case "tracker":
      return context.lookups.trackers.get(issue.trackerId) ?? "";
    case "status":
      return context.lookups.statuses.get(issue.statusId) ?? "";
    case "priority":
      return context.lookups.priorities.get(issue.priorityId) ?? "";
    case "subject":
      return issue.subject;
    case "author":
      return context.lookups.users.get(issue.authorId) ?? "";
    case "assigned_to":
      return assigneeName(issue, context.lookups);
    case "category":
      return issue.categoryId ? (context.lookups.categories.get(issue.categoryId) ?? "") : "";
    case "fixed_version":
      return issue.fixedVersionId ? (context.lookups.versions.get(issue.fixedVersionId) ?? "") : "";
    case "start_date":
      return issue.startDate ?? "";
    case "due_date":
      return issue.dueDate ?? "";
    case "estimated_hours":
      return issue.estimatedHours === null ? "" : String(issue.estimatedHours);
    case "spent_hours":
      return String(context.spentHours.get(issue.id) ?? 0);
    case "done_ratio":
      return `${issue.doneRatio}%`;
    case "is_private":
      return issue.isPrivate ? "はい" : "いいえ";
    case "created_on":
      return isoDate(issue.createdAt);
    case "updated_on":
      return isoDate(issue.updatedAt);
    default:
      return "";
  }
}

/**
 * The group a row belongs to, as the raw value the SQL `GROUP BY` produced. Must stay in
 * step with GROUP_EXPRESSIONS in issue-search-repository.ts — association columns group on
 * the foreign key, dates on the date itself.
 */
export function issueGroupValue(groupBy: string, issue: Issue, customValues: Map<string, string>): string | null {
  const customFieldId = parseCustomFieldKey(groupBy);
  if (customFieldId) {
    return customValues.get(`${issue.id}:${customFieldId}`) ?? null;
  }

  switch (groupBy) {
    case "tracker":
      return issue.trackerId;
    case "status":
      return issue.statusId;
    case "priority":
      return issue.priorityId;
    case "author":
      return issue.authorId;
    case "assigned_to":
      return issue.assignedToId;
    case "category":
      return issue.categoryId;
    case "fixed_version":
      return issue.fixedVersionId;
    case "start_date":
      return issue.startDate;
    case "due_date":
      return issue.dueDate;
    case "done_ratio":
      return String(issue.doneRatio);
    case "is_private":
      return String(issue.isPrivate);
    case "created_on":
      return isoDate(issue.createdAt);
    case "updated_on":
      return isoDate(issue.updatedAt);
    default:
      return null;
  }
}

/** Turns a raw group value into something readable — the inverse of `issueGroupValue`'s id choice. */
export function issueGroupLabel(groupBy: string, value: string | null, lookups: IssueListLookups): string {
  if (value === null) return "(なし)";
  switch (groupBy) {
    case "tracker":
      return lookups.trackers.get(value) ?? value;
    case "status":
      return lookups.statuses.get(value) ?? value;
    case "priority":
      return lookups.priorities.get(value) ?? value;
    case "author":
      return lookups.users.get(value) ?? value;
    case "assigned_to":
      return lookups.users.get(value) ?? lookups.groups.get(value) ?? value;
    case "category":
      return lookups.categories.get(value) ?? value;
    case "fixed_version":
      return lookups.versions.get(value) ?? value;
    case "is_private":
      return value === "true" ? "はい" : "いいえ";
    case "done_ratio":
      return `${value}%`;
    default:
      return value;
  }
}
