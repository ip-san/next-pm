export type VersionStatus = "open" | "locked" | "closed";

export type VersionSharing = "none" | "descendants" | "hierarchy" | "tree" | "system";

export interface Version {
  id: string;
  projectId: string;
  name: string;
  description: string;
  effectiveDate: string | null;
  status: VersionStatus;
  sharing: VersionSharing;
  wikiPageTitle: string | null;
  createdAt: Date;
  updatedAt: Date;
}
