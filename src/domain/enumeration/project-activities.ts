import type { Enumeration } from "./entity";

/**
 * Redmine's `Project#activities(include_inactive = false)`: the time-entry activities a
 * project actually offers. Start from the system-wide list, swap in this project's override
 * for any activity it has one for, and (unless asked for everything) drop the inactive ones.
 *
 * An override is a child row — same name and position as its parent, `project_id` set,
 * `parent_id` pointing at the system activity — so it must be substituted in place rather
 * than appended, or the parent would appear twice.
 */
export function resolveProjectActivities(
  systemActivities: Enumeration[],
  overrides: Enumeration[],
  options: { includeInactive?: boolean } = {},
): Enumeration[] {
  const overrideByParentId = new Map(overrides.flatMap((override) => (override.parentId ? [[override.parentId, override]] : [])));

  return systemActivities
    .map((activity) => overrideByParentId.get(activity.id) ?? activity)
    .filter((activity) => options.includeInactive || activity.active);
}

/**
 * Redmine's `Enumeration.overriding_change?` reduced to what next-pm can override. Redmine
 * compares the active flag *and* the activity's custom field values; next-pm has no custom
 * fields on enumerations (`customizedTypeEnum` is Issue | Project), so the active flag is
 * the whole of it — and a row that matches its parent is not an override at all and should
 * be deleted rather than kept.
 */
export function isOverridingChange(parent: Pick<Enumeration, "active">, desired: { active: boolean }): boolean {
  return parent.active !== desired.active;
}
