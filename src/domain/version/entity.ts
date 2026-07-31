export type VersionStatus = "open" | "locked" | "closed";

/** Sharing hierarchy walk is out of scope for now; only "none" is supported. */
export type VersionSharing = "none";

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
