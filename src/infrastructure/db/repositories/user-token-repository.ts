import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { userTokens } from "@/infrastructure/db/schema/user-tokens";
import type { UserToken, UserTokenAction } from "@/domain/user-token/entity";
import type { UserTokenRepository } from "@/domain/user-token/repository";

function toDomain(row: typeof userTokens.$inferSelect): UserToken {
  return {
    id: row.id,
    userId: row.userId,
    action: row.action,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export class DrizzleUserTokenRepository implements UserTokenRepository {
  async create(userId: string, action: UserTokenAction, tokenHash: string, expiresAt: Date): Promise<UserToken> {
    const [row] = await db.insert(userTokens).values({ userId, action, tokenHash, expiresAt }).returning();
    return toDomain(row);
  }

  async findByTokenHash(action: UserTokenAction, tokenHash: string): Promise<UserToken | null> {
    // The action is part of the lookup, not just the row: a hash is globally unique here, but
    // matching on it alone would let an activation link be replayed as a remember-me cookie.
    const [row] = await db
      .select()
      .from(userTokens)
      .where(and(eq(userTokens.action, action), eq(userTokens.tokenHash, tokenHash)))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async delete(id: string): Promise<void> {
    await db.delete(userTokens).where(eq(userTokens.id, id));
  }

  async deleteForUser(userId: string, action: UserTokenAction): Promise<void> {
    await db.delete(userTokens).where(and(eq(userTokens.userId, userId), eq(userTokens.action, action)));
  }
}
