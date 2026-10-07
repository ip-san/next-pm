export type EnumerationType = "IssuePriority" | "TimeEntryActivity" | "DocumentCategory";

export interface Enumeration {
  id: string;
  type: EnumerationType;
  name: string;
  position: number;
  isDefault: boolean;
  /** Redmine's `active` flag — an inactive activity stays on its old time entries but is no longer offered. */
  active: boolean;
  projectId: string | null;
  parentId: string | null;
}
