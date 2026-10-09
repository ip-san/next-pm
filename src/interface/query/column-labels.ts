import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import type { QueryColumn } from "@/domain/query/columns";

/**
 * The catalog key for each built-in column's name. Custom fields are not listed: their names are
 * data, typed by an administrator, so they stay as they are. The domain labels still hold the
 * Japanese names that the CSV and PDF exports use.
 */
const COLUMN_LABEL_KEYS: Record<string, MessageKey> = {
  tracker: "query.column.tracker",
  status: "query.column.status",
  priority: "query.column.priority",
  subject: "query.column.subject",
  author: "query.column.author",
  assigned_to: "query.column.assigned_to",
  category: "query.column.category",
  fixed_version: "query.column.fixed_version",
  start_date: "query.column.start_date",
  due_date: "query.column.due_date",
  estimated_hours: "query.column.estimated_hours",
  done_ratio: "query.column.done_ratio",
  is_private: "query.column.is_private",
  created_on: "query.column.created_on",
  updated_on: "query.column.updated_on",
  project: "query.column.project",
  spent_hours: "query.column.spent_hours",
};

/** The same columns with their names in `locale`. Used by the HTML screens only. */
export function localizeColumns(locale: Locale, columns: QueryColumn[]): QueryColumn[] {
  return columns.map((column) => {
    const key = COLUMN_LABEL_KEYS[column.key];
    return key ? { ...column, label: translate(locale, key) } : column;
  });
}

/** The time-entry list's column names: its own `user`, `activity`, `comments`, `hours` and so on, which the issue columns don't share. */
const TIME_ENTRY_COLUMN_LABEL_KEYS: Record<string, MessageKey> = {
  spent_on: "timeEntries.column.spent_on",
  user: "timeEntries.column.user",
  author: "timeEntries.column.author",
  activity: "timeEntries.column.activity",
  issue: "timeEntries.column.issue",
  comments: "timeEntries.column.comments",
  hours: "timeEntries.column.hours",
  created_on: "timeEntries.column.created_on",
  project: "query.column.project",
};

/** The time-entry columns with their names in `locale`. Used by the HTML screens only. */
export function localizeTimeEntryColumns(locale: Locale, columns: QueryColumn[]): QueryColumn[] {
  return columns.map((column) => {
    const key = TIME_ENTRY_COLUMN_LABEL_KEYS[column.key];
    return key ? { ...column, label: translate(locale, key) } : column;
  });
}
