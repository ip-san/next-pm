import { and, eq } from "drizzle-orm";
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
    const [row] = await db
      .select()
      .from(members)
      .where(and(eq(members.userId, userId), eq(members.projectId, projectId)))
      .limit(1);
    if (!row) return null;
    const [withRoles] = await attachRoleIds([row]);
    return withRoles;
  }

  async listByProject(projectId: string): Promise<Member[]> {
    const rows = await db.select().from(members).where(eq(members.projectId, projectId));
    return attachRoleIds(rows);
  }

  async create(member: Omit<Member, "id">): Promise<Member> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(members)
        .values({ userId: member.userId, projectId: member.projectId })
        .returning();
      if (member.roleIds.length > 0) {
        await tx.insert(memberRoles).values(member.roleIds.map((roleId) => ({ memberId: row.id, roleId })));
      }
      return { id: row.id, userId: row.userId, projectId: row.projectId, roleIds: member.roleIds };
    });
  }

  async delete(memberId: string): Promise<void> {
    await db.delete(members).where(eq(members.id, memberId));
  }
}
