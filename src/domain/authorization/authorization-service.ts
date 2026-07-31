import { isMemberRole, type Role } from "@/domain/role/entity";
import { isPermissionRegistered, PERMISSION_REGISTRY, type PermissionKey } from "./permission-registry";

export interface ProjectAuthorizationContext {
  isArchived: boolean;
  /** Redmine's Project#active? — false once the project is closed. */
  isActive: boolean;
  isPublic: boolean;
  enabledModules: string[];
}

type RoleForAuthorization = Pick<Role, "builtin" | "permissions" | "issuesVisibility">;

export type AuthorizationActor =
  | { kind: "admin" }
  | { kind: "member"; roles: RoleForAuthorization[] }
  | { kind: "non_member"; role: RoleForAuthorization }
  | { kind: "anonymous"; role: RoleForAuthorization };

export interface AuthorizationRequest {
  permission: PermissionKey | string;
  project: ProjectAuthorizationContext;
  actor: AuthorizationActor;
}

/**
 * Pure re-implementation of Redmine's permission resolution
 * (Project#allows_to? -> User#allowed_to? -> Role#allowed_to?).
 * Evaluation order is load-bearing and mirrors the Ruby source exactly:
 *   1. unregistered permission -> deny
 *   2. archived project -> deny (no exceptions, not even admin)
 *   3. closed project + non-read-only permission -> deny
 *   4. permission's module not enabled -> deny
 *   5. admin -> allow
 *   6. otherwise, allow if any resolved role has the permission AND
 *      (the project is public OR the role is an ordinary member role)
 */
export function can(request: AuthorizationRequest): boolean {
  const { permission, project, actor } = request;

  if (!isPermissionRegistered(permission)) {
    return false;
  }
  if (project.isArchived) {
    return false;
  }

  const definition = PERMISSION_REGISTRY[permission];

  if (!project.isActive && !definition.readOnly) {
    return false;
  }
  if (definition.module && !project.enabledModules.includes(definition.module)) {
    return false;
  }
  if (actor.kind === "admin") {
    return true;
  }

  const roles: RoleForAuthorization[] =
    actor.kind === "member" ? actor.roles : [actor.role];

  return roles.some(
    (role) => (project.isPublic || isMemberRole(role)) && role.permissions.includes(permission),
  );
}
