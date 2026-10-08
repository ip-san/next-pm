import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { userSessions } from "@/infrastructure/db/schema/user-sessions";
import type { UserSession } from "@/domain/user-session/entity";
import type { UserSessionRepository } from "@/domain/user-session/repository";

function toDomain(row: typeof userSessions.$inferSelect): UserSession {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
    lastActiveAt: row.lastActiveAt,
  };
}

export class DrizzleUserSessionRepository implements UserSessionRepository {
  async create(userId: string): Promise<UserSession> {
    const [row] = await db.insert(userSessions).values({ userId }).returning();
    return toDomain(row);
  }

  async findById(id: string): Promise<UserSession | null> {
    const [row] = await db.select().from(userSessions).where(eq(userSessions.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async touch(id: string, at: Date): Promise<void> {
    await db.update(userSessions).set({ lastActiveAt: at }).where(eq(userSessions.id, id));
  }

  async delete(id: string): Promise<void> {
    await db.delete(userSessions).where(eq(userSessions.id, id));
  }

  async deleteForUser(userId: string): Promise<void> {
    await db.delete(userSessions).where(eq(userSessions.userId, userId));
  }
}
