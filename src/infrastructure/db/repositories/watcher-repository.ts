import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { watchers } from "@/infrastructure/db/schema/watchers";
import type { WatchableType } from "@/domain/watcher/entity";
import type { WatcherRepository } from "@/domain/watcher/repository";

export class DrizzleWatcherRepository implements WatcherRepository {
  async isWatching(watchableType: WatchableType, watchableId: string, userId: string): Promise<boolean> {
    const [row] = await db
      .select()
      .from(watchers)
      .where(and(eq(watchers.watchableType, watchableType), eq(watchers.watchableId, watchableId), eq(watchers.userId, userId)))
      .limit(1);
    return !!row;
  }

  async watch(watchableType: WatchableType, watchableId: string, userId: string): Promise<void> {
    await db
      .insert(watchers)
      .values({ watchableType, watchableId, userId })
      .onConflictDoNothing();
  }

  async unwatch(watchableType: WatchableType, watchableId: string, userId: string): Promise<void> {
    await db
      .delete(watchers)
      .where(and(eq(watchers.watchableType, watchableType), eq(watchers.watchableId, watchableId), eq(watchers.userId, userId)));
  }

  async listWatchedIds(watchableType: WatchableType, userId: string): Promise<string[]> {
    const rows = await db
      .select({ watchableId: watchers.watchableId })
      .from(watchers)
      .where(and(eq(watchers.watchableType, watchableType), eq(watchers.userId, userId)));
    return rows.map((r) => r.watchableId);
  }

  async listWatcherUserIds(watchableType: WatchableType, watchableId: string): Promise<string[]> {
    const rows = await db
      .select({ userId: watchers.userId })
      .from(watchers)
      .where(and(eq(watchers.watchableType, watchableType), eq(watchers.watchableId, watchableId)));
    return rows.map((r) => r.userId);
  }
}
