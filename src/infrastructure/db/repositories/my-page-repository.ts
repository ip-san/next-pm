import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { myPageLayouts } from "@/infrastructure/db/schema/my-page-layouts";
import type { MyPageLayout } from "@/domain/my-page/entity";
import type { MyPagePreferences, MyPageRepository } from "@/domain/my-page/repository";

export class DrizzleMyPageRepository implements MyPageRepository {
  async find(userId: string): Promise<MyPagePreferences | null> {
    const [row] = await db.select().from(myPageLayouts).where(eq(myPageLayouts.userId, userId)).limit(1);
    if (!row) return null;
    return {
      layout: row.layout as MyPageLayout,
      blockSettings: row.blockSettings as Record<string, Record<string, unknown>>,
    };
  }

  async save(userId: string, preferences: MyPagePreferences): Promise<void> {
    await db
      .insert(myPageLayouts)
      .values({ userId, layout: preferences.layout, blockSettings: preferences.blockSettings })
      .onConflictDoUpdate({
        target: myPageLayouts.userId,
        set: { layout: preferences.layout, blockSettings: preferences.blockSettings },
      });
  }
}
