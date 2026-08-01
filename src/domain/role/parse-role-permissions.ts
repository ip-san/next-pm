import { isPermissionRegistered, type PermissionKey } from "@/domain/authorization/permission-registry";

/**
 * Parses the admin role-permissions matrix's FormData entries. Convention: a `roleIds` entry
 * per row registers that role (present even with zero checked boxes, mirroring Redmine's
 * hidden `permissions[role_id][]` field — so unchecking every box for a role still clears it
 * rather than leaving it untouched), and `permissions:<roleId>` entries carry each checked
 * permission's key for that role.
 */
export function parseRolePermissionEntries(
  entries: Array<[string, string]>,
): { ok: true; permissionsByRoleId: Map<string, PermissionKey[]> } | { ok: false; error: string } {
  // Two passes so entry order within the FormData doesn't matter — a `permissions:<roleId>`
  // entry can otherwise land before that role's `roleIds` marker depending on how the grid
  // is laid out in the DOM.
  const permissionsByRoleId = new Map<string, PermissionKey[]>();
  for (const [key, value] of entries) {
    if (key === "roleIds" && value) {
      permissionsByRoleId.set(value, []);
    }
  }

  for (const [key, value] of entries) {
    if (!key.startsWith("permissions:")) continue;
    const roleId = key.slice("permissions:".length);
    const permissions = permissionsByRoleId.get(roleId);
    if (!permissions || !isPermissionRegistered(value)) {
      return { ok: false, error: "不正な入力が指定されました。" };
    }
    permissions.push(value);
  }
  return { ok: true, permissionsByRoleId };
}
