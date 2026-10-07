import { isPermissionSetableForBuiltin, PERMISSION_REGISTRY, type PermissionKey } from "@/domain/authorization/permission-registry";

/** Mirrors Redmine's Role::BUILTIN_NON_MEMBER / BUILTIN_ANONYMOUS; 0 means an ordinary, assignable role. */
export const ROLE_BUILTIN_MEMBER = 0;
export const ROLE_BUILTIN_NON_MEMBER = 1;
export const ROLE_BUILTIN_ANONYMOUS = 2;

export type RoleBuiltin =
  | typeof ROLE_BUILTIN_MEMBER
  | typeof ROLE_BUILTIN_NON_MEMBER
  | typeof ROLE_BUILTIN_ANONYMOUS;

export type IssuesVisibility = "all" | "default" | "own";
export type TimeEntriesVisibility = "all" | "own";
export type UsersVisibility = "all" | "members_of_visible_projects";

export interface Role {
  id: string;
  name: string;
  builtin: RoleBuiltin;
  position: number;
  permissions: PermissionKey[];
  issuesVisibility: IssuesVisibility;
  timeEntriesVisibility: TimeEntriesVisibility;
  usersVisibility: UsersVisibility;
  assignable: boolean;
}

/** Redmine's Role#member? — true for ordinary, non-builtin roles. */
export function isMemberRole(role: Pick<Role, "builtin">): boolean {
  return role.builtin === ROLE_BUILTIN_MEMBER;
}

export function hasPermission(role: Pick<Role, "permissions">, permission: PermissionKey): boolean {
  return role.permissions.includes(permission);
}

/** Redmine's Role#builtin? — true for the Non member and Anonymous roles. */
export function isBuiltinRole(role: Pick<Role, "builtin">): boolean {
  return role.builtin !== ROLE_BUILTIN_MEMBER;
}

/**
 * Mirrors Role#setable_permissions: the Non member role can't hold a permission declared
 * `:require => :member`, and the Anonymous role can hold neither those nor the
 * `:require => :loggedin` ones. An ordinary role can hold any of them.
 */
export function setablePermissions(builtin: RoleBuiltin): PermissionKey[] {
  const keys = Object.keys(PERMISSION_REGISTRY) as PermissionKey[];
  return keys.filter((key) => isPermissionSetableForBuiltin(key, builtin));
}
