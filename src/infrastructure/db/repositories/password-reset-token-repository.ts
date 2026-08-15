import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { passwordResetTokens } from "@/infrastructure/db/schema/password-reset-tokens";
import type { PasswordResetToken } from "@/domain/password-reset/entity";
import type { PasswordResetTokenRepository } from "@/domain/password-reset/repository";

function toDomain(row: typeof passwordResetTokens.$inferSelect): PasswordResetToken {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export class DrizzlePasswordResetTokenRepository implements PasswordResetTokenRepository {
  async create(userId: string, tokenHash: string, expiresAt: Date): Promise<PasswordResetToken> {
    const [row] = await db.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt }).returning();
    return toDomain(row);
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const [row] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash)).limit(1);
    return row ? toDomain(row) : null;
  }

  async deleteForUser(userId: string): Promise<void> {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  }

  async delete(id: string): Promise<void> {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, id));
  }
}
