import { eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { roles } from "@/infrastructure/db/schema/roles";
import { ROLE_BUILTIN_ANONYMOUS, ROLE_BUILTIN_NON_MEMBER, type Role } from "@/domain/role/entity";
import type { RoleRepository } from "@/domain/role/repository";

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

export class DrizzleRoleRepository implements RoleRepository {
  async listAll(): Promise<Role[]> {
    const rows = await db.select().from(roles);
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
}
