import type { TrackerCoreField } from "./core-fields";

export interface Tracker {
  id: string;
  name: string;
  defaultStatusId: string;
  position: number;
  isInRoadmap: boolean;
  /** Standard issue fields switched off for this tracker — Redmine's Tracker#disabled_core_fields. */
  disabledCoreFields: TrackerCoreField[];
}
