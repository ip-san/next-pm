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

/**
 * Derives the authorization context from a project record. Lives here rather than only in
 * the HTTP layer so a use case can build it from the project *it* just loaded, instead of
 * trusting a context handed in by its caller — a caller that skipped the archived/closed or
 * enabled-module state would otherwise let `can` wave the request through.
 */
export function projectAuthorizationContext(project: {
  status: string;
  isPublic: boolean;
  enabledModules: string[];
}): ProjectAuthorizationContext {
  return {
    isArchived: project.status === "archived",
    isActive: project.status === "active",
    isPublic: project.isPublic,
    enabledModules: project.enabledModules,
  };
}

export type AuthorizationActor =
  | { kind: "admin" }
  | { kind: "member"; roles: RoleForAuthorization[] }
  | { kind: "non_member"; role: RoleForAuthorization }
  | { kind: "anonymous"; role: RoleForAuthorization };

/**
 * The roles whose `issuesVisibility` governs what this actor may see, so a use case can run
 * the private-issue check itself instead of trusting a caller's verdict. An admin carries no
 * real roles but must always pass, mirroring User#allowed_to?'s admin short-circuit.
 */
export function actorIssuesVisibilityRoles(actor: AuthorizationActor): { issuesVisibility: Role["issuesVisibility"] }[] {
  switch (actor.kind) {
    case "admin":
      return [{ issuesVisibility: "all" }];
    case "member":
      return actor.roles;
    case "non_member":
    case "anonymous":
      return [actor.role];
  }
}

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

export interface GlobalAuthorizationRequest {
  permission: PermissionKey | string;
  isAdmin: boolean;
  /**
   * Every role the actor holds in any project, plus their builtin role (Non member when
   * logged in, Anonymous otherwise) — Redmine's `self.roles | memberships.roles` union with
   * the builtin appended.
   */
  roles: Pick<Role, "permissions">[];
}

/**
 * Redmine's `User#allowed_to?(permission, nil, :global => true)`, used for the handful of
 * permissions that are asked about with no project in hand — `add_project` is the one this
 * codebase needs, since the project it would authorize does not exist yet.
 *
 * Deliberately has none of `can`'s project rules: with no project there is no status to be
 * archived or closed, and no enabled-module list, so a permission belonging to a module is
 * answered on the role alone. Redmine's global branch does the same.
 */
export function canGlobally(request: GlobalAuthorizationRequest): boolean {
  const { permission } = request;
  if (!isPermissionRegistered(permission)) {
    return false;
  }
  if (request.isAdmin) {
    return true;
  }
  return request.roles.some((role) => role.permissions.includes(permission));
}
