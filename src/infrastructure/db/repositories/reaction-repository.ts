import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { reactions } from "@/infrastructure/db/schema/reactions";
import type { Reaction, ReactableType } from "@/domain/reaction/entity";
import type { ReactionRepository } from "@/domain/reaction/repository";

function toDomain(row: typeof reactions.$inferSelect): Reaction {
  return {
    id: row.id,
    reactableType: row.reactableType as ReactableType,
    reactableId: row.reactableId,
    userId: row.userId,
    createdAt: row.createdAt,
  };
}

export class DrizzleReactionRepository implements ReactionRepository {
  async hasReacted(reactableType: ReactableType, reactableId: string, userId: string): Promise<boolean> {
    const [row] = await db
      .select()
      .from(reactions)
      .where(and(eq(reactions.reactableType, reactableType), eq(reactions.reactableId, reactableId), eq(reactions.userId, userId)))
      .limit(1);
    return !!row;
  }

  async react(reactableType: ReactableType, reactableId: string, userId: string): Promise<void> {
    await db
      .insert(reactions)
      .values({ reactableType, reactableId, userId })
      .onConflictDoNothing();
  }

  async unreact(reactableType: ReactableType, reactableId: string, userId: string): Promise<void> {
    await db
      .delete(reactions)
      .where(and(eq(reactions.reactableType, reactableType), eq(reactions.reactableId, reactableId), eq(reactions.userId, userId)));
  }

  async listForReactables(reactableType: ReactableType, reactableIds: string[]): Promise<Reaction[]> {
    if (reactableIds.length === 0) return [];
    const rows = await db
      .select()
      .from(reactions)
      .where(and(eq(reactions.reactableType, reactableType), inArray(reactions.reactableId, reactableIds)));
    return rows.map(toDomain);
  }
}
