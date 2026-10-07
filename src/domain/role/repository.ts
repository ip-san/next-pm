import type { Role } from "./entity";
import type { PermissionKey } from "@/domain/authorization/permission-registry";

export interface RoleRepository {
  listAll(): Promise<Role[]>;
  findById(id: string): Promise<Role | null>;
  findByIds(ids: string[]): Promise<Role[]>;
  findBuiltinNonMember(): Promise<Role>;
  findBuiltinAnonymous(): Promise<Role>;
  listAssignable(): Promise<Role[]>;
  /**
   * Redmine's `Role.givable` — `where(builtin: 0)`, the roles a *member* can actually be
   * given. `listAssignable` only applies the `assignable` flag, so it still includes the
   * builtin Non member and Anonymous roles; those two describe people who are *not*
   * members and must never appear in a member role picker. Kept separate rather than
   * narrowing listAssignable, whose other callers (the workflow editor, and the admin
   * branch of resolveActor, mirroring `user.admin? ? Role.all : ...`) do want builtins.
   */
  listGivable(): Promise<Role[]>;
  create(role: Omit<Role, "id">): Promise<Role>;
  /** Mirrors Redmine's RolesController#update_permissions — replaces this role's permission set wholesale. */
  updatePermissions(roleId: string, permissions: PermissionKey[]): Promise<void>;
}
