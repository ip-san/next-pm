export type EnumerationType = "IssuePriority" | "TimeEntryActivity" | "DocumentCategory";

export interface Enumeration {
  id: string;
  type: EnumerationType;
  name: string;
  position: number;
  isDefault: boolean;
  projectId: string | null;
  parentId: string | null;
}
