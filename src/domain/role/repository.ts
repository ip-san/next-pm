import type { Role } from "./entity";
import type { PermissionKey } from "@/domain/authorization/permission-registry";
import type { Positioned } from "@/domain/ordering/positioned";

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

/** Admin-screen writes — see IssueStatusAdminRepository for why these sit apart. */
export interface RoleAdminRepository {
  update(
    id: string,
    changes: Pick<
      Role,
      "name" | "permissions" | "issuesVisibility" | "timeEntriesVisibility" | "usersVisibility" | "assignable"
    >,
  ): Promise<Role>;
  delete(id: string): Promise<void>;
  /** Count of member_roles rows naming this role — the `members.any?` half of Role#check_deletable. */
  countMemberships(id: string): Promise<number>;
  updatePositions(positions: Positioned[]): Promise<void>;
}
