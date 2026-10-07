import { count, eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { memberRoles } from "@/infrastructure/db/schema/members";
import { roles } from "@/infrastructure/db/schema/roles";
import { ROLE_BUILTIN_ANONYMOUS, ROLE_BUILTIN_NON_MEMBER, type Role } from "@/domain/role/entity";
import type { Positioned } from "@/domain/ordering/positioned";
import type { RoleAdminRepository, RoleRepository } from "@/domain/role/repository";

function toDomain(row: typeof roles.$inferSelect): Role {
  return {
    id: row.id,
    name: row.name,
    builtin: row.builtin as Role["builtin"],
    position: row.position,
    permissions: row.permissions,
    issuesVisibility: row.issuesVisibility,
    timeEntriesVisibility: row.timeEntriesVisibility,
    usersVisibility: row.usersVisibility,
    assignable: row.assignable,
  };
}

export class DrizzleRoleRepository implements RoleRepository, RoleAdminRepository {
  async listAll(): Promise<Role[]> {
    // Redmine's `Role.sorted` is order(:builtin, :position) — ordinary roles first, in their
    // configured order, then Non member and Anonymous. The id tiebreak keeps rows that still
    // share position 0 in a stable order (see DrizzleIssueStatusRepository#listAll).
    const rows = await db.select().from(roles).orderBy(roles.builtin, roles.position, roles.id);
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Role | null> {
    const [row] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByIds(ids: string[]): Promise<Role[]> {
    if (ids.length === 0) return [];
    const rows = await db.select().from(roles).where(inArray(roles.id, ids));
    return rows.map(toDomain);
  }

  async findBuiltinNonMember(): Promise<Role> {
    const [row] = await db.select().from(roles).where(eq(roles.builtin, ROLE_BUILTIN_NON_MEMBER)).limit(1);
    if (!row) throw new Error("Builtin Non-member role is missing; run the seed script.");
    return toDomain(row);
  }

  async findBuiltinAnonymous(): Promise<Role> {
    const [row] = await db.select().from(roles).where(eq(roles.builtin, ROLE_BUILTIN_ANONYMOUS)).limit(1);
    if (!row) throw new Error("Builtin Anonymous role is missing; run the seed script.");
    return toDomain(row);
  }

  async listAssignable(): Promise<Role[]> {
    const rows = await db.select().from(roles).where(eq(roles.assignable, true));
    return rows.map(toDomain);
  }

  async updatePermissions(roleId: string, permissions: Role["permissions"]): Promise<void> {
    await db.update(roles).set({ permissions }).where(eq(roles.id, roleId));
  }

  async create(role: Omit<Role, "id">): Promise<Role> {
    const [row] = await db
      .insert(roles)
      .values({
        name: role.name,
        builtin: role.builtin,
        position: role.position,
        permissions: role.permissions,
        issuesVisibility: role.issuesVisibility,
        timeEntriesVisibility: role.timeEntriesVisibility,
        usersVisibility: role.usersVisibility,
        assignable: role.assignable,
      })
      .returning();
    return toDomain(row);
  }

  async update(
    id: string,
    changes: Pick<
      Role,
      "name" | "permissions" | "issuesVisibility" | "timeEntriesVisibility" | "usersVisibility" | "assignable"
    >,
  ): Promise<Role> {
    const [row] = await db.update(roles).set(changes).where(eq(roles.id, id)).returning();
    return toDomain(row);
  }

  async delete(id: string): Promise<void> {
    // member_roles and workflow rows cascade on their role FK; the caller must have already
    // refused the delete if any membership still names the role (Role#check_deletable).
    await db.delete(roles).where(eq(roles.id, id));
  }

  async countMemberships(id: string): Promise<number> {
    const [row] = await db.select({ value: count() }).from(memberRoles).where(eq(memberRoles.roleId, id));
    return row?.value ?? 0;
  }

  async updatePositions(positions: Positioned[]): Promise<void> {
    for (const { id, position } of positions) {
      await db.update(roles).set({ position }).where(eq(roles.id, id));
    }
  }
}
