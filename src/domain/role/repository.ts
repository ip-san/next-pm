import type { Role } from "./entity";
import type { PermissionKey } from "@/domain/authorization/permission-registry";

export interface RoleRepository {
  listAll(): Promise<Role[]>;
  findById(id: string): Promise<Role | null>;
  findByIds(ids: string[]): Promise<Role[]>;
  findBuiltinNonMember(): Promise<Role>;
  findBuiltinAnonymous(): Promise<Role>;
  listAssignable(): Promise<Role[]>;
  create(role: Omit<Role, "id">): Promise<Role>;
  /** Mirrors Redmine's RolesController#update_permissions — replaces this role's permission set wholesale. */
  updatePermissions(roleId: string, permissions: PermissionKey[]): Promise<void>;
}
