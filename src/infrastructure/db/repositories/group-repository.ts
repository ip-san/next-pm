import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { groups, groupUsers } from "@/infrastructure/db/schema/groups";
import type { Group } from "@/domain/group/entity";
import type { GroupRepository } from "@/domain/group/repository";

export class DrizzleGroupRepository implements GroupRepository {
  async create(name: string): Promise<Group> {
    const [row] = await db.insert(groups).values({ name }).returning();
    return { id: row.id, name: row.name };
  }

  async findById(id: string): Promise<Group | null> {
    const [row] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
    return row ? { id: row.id, name: row.name } : null;
  }

  async rename(id: string, name: string): Promise<Group> {
    const [row] = await db.update(groups).set({ name }).where(eq(groups.id, id)).returning();
    return { id: row.id, name: row.name };
  }

  async listAll(): Promise<Group[]> {
    const rows = await db.select().from(groups).orderBy(groups.name);
    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  async delete(id: string): Promise<void> {
    await db.delete(groups).where(eq(groups.id, id));
  }

  async addUser(groupId: string, userId: string): Promise<void> {
    await db.insert(groupUsers).values({ groupId, userId }).onConflictDoNothing();
  }

  async removeUser(groupId: string, userId: string): Promise<void> {
    await db.delete(groupUsers).where(and(eq(groupUsers.groupId, groupId), eq(groupUsers.userId, userId)));
  }

  async listUserIds(groupId: string): Promise<string[]> {
    const rows = await db.select({ userId: groupUsers.userId }).from(groupUsers).where(eq(groupUsers.groupId, groupId));
    return rows.map((row) => row.userId);
  }

  async listGroupIdsForUser(userId: string): Promise<string[]> {
    const rows = await db.select({ groupId: groupUsers.groupId }).from(groupUsers).where(eq(groupUsers.userId, userId));
    return rows.map((row) => row.groupId);
  }
}
