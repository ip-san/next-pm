import type { Tracker } from "./entity";

/**
 * Mirrors `Tracker::CORE_FIELDS` (redmine/app/models/tracker.rb): the standard issue fields an
 * administrator may switch off per tracker, so a tracker that has no use for (say) a due date
 * stops offering one. Named with next-pm's issue attribute names rather than Redmine's column
 * names (`parentId` is Redmine's `parent_issue_id`).
 *
 * Redmine stores the disabled set as a bitmask over this array's index order, which is why its
 * comment says new fields must be appended rather than inserted. next-pm stores the field names
 * themselves, so the order here is presentation only and safe to change.
 */
export const TRACKER_CORE_FIELDS = [
  "assignedToId",
  "categoryId",
  "fixedVersionId",
  "parentId",
  "startDate",
  "dueDate",
  "estimatedHours",
  "doneRatio",
  "description",
  "priorityId",
] as const;

export type TrackerCoreField = (typeof TRACKER_CORE_FIELDS)[number];

/**
 * Mirrors `Tracker::CORE_FIELDS_UNDISABLABLE` — an issue cannot exist without these, so they
 * are never offered on the admin screen. Kept here so the distinction stays visible.
 */
export const TRACKER_UNDISABLABLE_CORE_FIELDS = ["projectId", "trackerId", "subject", "isPrivate"] as const;

export function isTrackerCoreField(value: string): value is TrackerCoreField {
  return (TRACKER_CORE_FIELDS as readonly string[]).includes(value);
}

/** Keeps only recognised field names, in the canonical order — used when persisting a form submission. */
export function normalizeDisabledCoreFields(fields: readonly string[]): TrackerCoreField[] {
  const submitted = new Set(fields);
  return TRACKER_CORE_FIELDS.filter((field) => submitted.has(field));
}

/** Redmine's `Tracker#core_fields` — the complement of the disabled set. */
export function enabledCoreFields(tracker: Pick<Tracker, "disabledCoreFields">): TrackerCoreField[] {
  const disabled = new Set(tracker.disabledCoreFields);
  return TRACKER_CORE_FIELDS.filter((field) => !disabled.has(field));
}

export function isCoreFieldDisabled(tracker: Pick<Tracker, "disabledCoreFields">, field: TrackerCoreField): boolean {
  return tracker.disabledCoreFields.includes(field);
}

/**
 * Redmine's `Tracker.disabled_core_fields(trackers)` — the intersection, so a field only counts
 * as disabled for a set of trackers when every one of them disables it. Used by bulk edit,
 * where a field has to stay available while any selected tracker still wants it. An empty set
 * of trackers disables nothing.
 */
export function disabledCoreFieldsAcross(
  trackers: readonly Pick<Tracker, "disabledCoreFields">[],
): TrackerCoreField[] {
  if (trackers.length === 0) return [];
  return TRACKER_CORE_FIELDS.filter((field) => trackers.every((tracker) => tracker.disabledCoreFields.includes(field)));
}

/** Redmine's `Tracker.core_fields(trackers)` — the union of what any of them still enables. */
export function enabledCoreFieldsAcross(
  trackers: readonly Pick<Tracker, "disabledCoreFields">[],
): TrackerCoreField[] {
  if (trackers.length === 0) return [...TRACKER_CORE_FIELDS];
  const disabled = new Set(disabledCoreFieldsAcross(trackers));
  return TRACKER_CORE_FIELDS.filter((field) => !disabled.has(field));
}

/**
 * Drops the attributes a tracker has switched off from a submitted change set, the way
 * Redmine's `Issue#safe_attribute_names` leaves a disabled core field out of the writable list
 * so a submitted value for it is ignored rather than rejected.
 *
 * Not yet wired into the issue create/update use cases — the issue form is being reworked in
 * parallel, so this stays a helper for that work to call rather than an edit to those files.
 */
export function withoutDisabledCoreFields<T extends Partial<Record<TrackerCoreField, unknown>>>(
  tracker: Pick<Tracker, "disabledCoreFields">,
  attributes: T,
): T {
  const result = { ...attributes };
  for (const field of tracker.disabledCoreFields) {
    delete result[field];
  }
  return result;
}
