import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { memberRoles, members } from "@/infrastructure/db/schema/members";
import type { Member } from "@/domain/member/entity";
import type { MemberRepository } from "@/domain/member/repository";

async function attachRoleIds(memberRows: (typeof members.$inferSelect)[]): Promise<Member[]> {
  if (memberRows.length === 0) return [];
  const result: Member[] = [];
  for (const row of memberRows) {
    const roleRows = await db
      .select({ roleId: memberRoles.roleId })
      .from(memberRoles)
      .where(eq(memberRoles.memberId, row.id));
    result.push({
      id: row.id,
      userId: row.userId,
      groupId: row.groupId,
      inheritedFromMemberId: row.inheritedFromMemberId,
      projectId: row.projectId,
      roleIds: roleRows.map((r) => r.roleId),
    });
  }
  return result;
}

export class DrizzleMemberRepository implements MemberRepository {
  async findById(memberId: string): Promise<Member | null> {
    const [row] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
    if (!row) return null;
    const [withRoles] = await attachRoleIds([row]);
    return withRoles;
  }

  async findByUserAndProject(userId: string, projectId: string): Promise<Member | null> {
    const rows = await db
      .select()
      .from(members)
      .where(and(eq(members.userId, userId), eq(members.projectId, projectId)));
    if (rows.length === 0) return null;
    const withRoles = await attachRoleIds(rows);
    const roleIds = [...new Set(withRoles.flatMap((m) => m.roleIds))];
    return { ...withRoles[0], roleIds };
  }

  async findDirectByUserAndProject(userId: string, projectId: string): Promise<Member | null> {
    const [row] = await db
      .select()
      .from(members)
      .where(and(eq(members.userId, userId), eq(members.projectId, projectId), isNull(members.inheritedFromMemberId)))
      .limit(1);
    if (!row) return null;
    const [withRoles] = await attachRoleIds([row]);
    return withRoles;
  }

  async listByProject(projectId: string): Promise<Member[]> {
    const rows = await db.select().from(members).where(eq(members.projectId, projectId));
    return attachRoleIds(rows);
  }

  async listByGroup(groupId: string): Promise<Member[]> {
    const rows = await db.select().from(members).where(eq(members.groupId, groupId));
    return attachRoleIds(rows);
  }

  async create(member: Omit<Member, "id">): Promise<Member> {
    if ((member.userId === null) === (member.groupId === null)) {
      throw new Error("A member row must have exactly one of userId/groupId set");
    }
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(members)
        .values({
          userId: member.userId,
          groupId: member.groupId,
          inheritedFromMemberId: member.inheritedFromMemberId,
          projectId: member.projectId,
        })
        .returning();
      if (member.roleIds.length > 0) {
        await tx.insert(memberRoles).values(member.roleIds.map((roleId) => ({ memberId: row.id, roleId })));
      }
      return {
        id: row.id,
        userId: row.userId,
        groupId: row.groupId,
        inheritedFromMemberId: row.inheritedFromMemberId,
        projectId: row.projectId,
        roleIds: member.roleIds,
      };
    });
  }

  async delete(memberId: string): Promise<void> {
    await db.delete(members).where(eq(members.id, memberId));
  }

  async deleteInherited(groupMemberId: string, userId: string): Promise<void> {
    await db.delete(members).where(and(eq(members.inheritedFromMemberId, groupMemberId), eq(members.userId, userId)));
  }

  async findInherited(groupMemberId: string, userId: string): Promise<Member | null> {
    const [row] = await db
      .select()
      .from(members)
      .where(and(eq(members.inheritedFromMemberId, groupMemberId), eq(members.userId, userId)))
      .limit(1);
    if (!row) return null;
    const [withRoles] = await attachRoleIds([row]);
    return withRoles;
  }
}
