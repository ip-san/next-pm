import { CUSTOM_VALUE_SEPARATOR } from "@/domain/custom-value/separator";
import { parseCustomFieldKey, type QueryColumn } from "@/domain/query/columns";
import type { TimeEntry } from "@/domain/time-entry/entity";

/** Id -> display name maps for every association a time-entry column can render. */
export interface TimeEntryListLookups {
  projects: Map<string, string>;
  users: Map<string, string>;
  activities: Map<string, string>;
  /** Issue subjects, for the issue column. A missing id renders blank. */
  issues: Map<string, string>;
}

export interface TimeEntryRowContext {
  lookups: TimeEntryListLookups;
  /** Keyed `${entryId}:${customFieldId}`, as the search repository returns it. */
  customValues: Map<string, string>;
}

/** Renders one cell. Shared by the HTML table and the CSV export so the two can't drift. */
export function timeEntryColumnValue(column: QueryColumn, entry: TimeEntry, context: TimeEntryRowContext): string {
  const customFieldId = parseCustomFieldKey(column.key);
  if (customFieldId) {
    // A multiple-valued field's values come one per line; a cell shows them comma-separated.
    return (context.customValues.get(`${entry.id}:${customFieldId}`) ?? "").split(CUSTOM_VALUE_SEPARATOR).join(", ");
  }

  switch (column.key) {
    case "project":
      return context.lookups.projects.get(entry.projectId) ?? "";
    case "spent_on":
      return entry.spentOn;
    case "user":
      return context.lookups.users.get(entry.userId) ?? "";
    case "author":
      return context.lookups.users.get(entry.authorId) ?? "";
    case "activity":
      return context.lookups.activities.get(entry.activityId) ?? "";
    case "issue":
      return entry.issueId ? (context.lookups.issues.get(entry.issueId) ?? "") : "";
    case "comments":
      return entry.comments;
    case "hours":
      return String(entry.hours);
    case "created_on":
      return entry.createdAt.toISOString().slice(0, 10);
    default:
      return "";
  }
}

/**
 * The group a row belongs to, as the raw value the SQL `GROUP BY` produced. Must stay in
 * step with GROUP_EXPRESSIONS in time-entry-search-repository.ts.
 */
export function timeEntryGroupValue(groupBy: string, entry: TimeEntry, customValues: Map<string, string>): string | null {
  const customFieldId = parseCustomFieldKey(groupBy);
  if (customFieldId) {
    return customValues.get(`${entry.id}:${customFieldId}`) ?? null;
  }

  switch (groupBy) {
    case "project":
      return entry.projectId;
    case "spent_on":
      return entry.spentOn;
    case "user":
      return entry.userId;
    case "activity":
      return entry.activityId;
    case "issue":
      return entry.issueId;
    case "created_on":
      return entry.createdAt.toISOString().slice(0, 10);
    default:
      return null;
  }
}

/** Turns a raw group value into something readable — the inverse of `timeEntryGroupValue`'s id choice. */
export function timeEntryGroupLabel(groupBy: string, value: string | null, lookups: TimeEntryListLookups): string {
  if (value === null) return "(なし)";
  switch (groupBy) {
    case "project":
      return lookups.projects.get(value) ?? value;
    case "user":
      return lookups.users.get(value) ?? value;
    case "activity":
      return lookups.activities.get(value) ?? value;
    case "issue":
      return lookups.issues.get(value) ?? value;
    default:
      return value;
  }
}
