import type { CustomField } from "./entity";

/** Who is asking: admins see every field, and everyone else sees a field through their roles in that project. */
export interface CustomFieldViewer {
  isAdmin: boolean;
  /** The roles the viewer holds in the project the value belongs to (roles_for_project). */
  roleIds: string[];
}

/**
 * Redmine's CustomField#visible_by?: a public field is visible to everyone; a restricted one is visible to
 * admins and to viewers holding one of the field's roles in the project. Pure, so each read path can apply it
 * per row with the project that row belongs to.
 */
export function isCustomFieldVisibleTo(field: Pick<CustomField, "visible" | "roleIds">, viewer: CustomFieldViewer): boolean {
  if (field.visible || viewer.isAdmin) return true;
  return field.roleIds.some((roleId) => viewer.roleIds.includes(roleId));
}

/**
 * Redmine's CustomField#after_save: making a field public again clears its roles, so a later switch back to
 * restricted doesn't resurrect old role grants. Roles are only kept when the field is restricted.
 */
export function normalizeFieldVisibility(input: { visible: boolean; roleIds: string[] }): { visible: boolean; roleIds: string[] } {
  if (input.visible) return { visible: true, roleIds: [] };
  return { visible: false, roleIds: [...new Set(input.roleIds)] };
}

/** The fields the viewer may read or write, in their original order. */
export function visibleCustomFieldsFor<T extends Pick<CustomField, "visible" | "roleIds">>(fields: T[], viewer: CustomFieldViewer): T[] {
  return fields.filter((field) => isCustomFieldVisibleTo(field, viewer));
}

/**
 * Fields a list can offer as columns and filters: those the viewer sees in every project the list covers. A
 * field visible in only some of them is left out, so a filter on it can't tell rows apart by a value the viewer
 * can't see in the others. With no project in scope, only public fields are offered.
 */
export function customFieldsVisibleInEveryScope<T extends Pick<CustomField, "visible" | "roleIds">>(
  fields: T[],
  viewers: CustomFieldViewer[],
): T[] {
  if (viewers.length === 0) return fields.filter((field) => field.visible);
  return fields.filter((field) => viewers.every((viewer) => isCustomFieldVisibleTo(field, viewer)));
}
