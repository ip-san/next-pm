import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { customValues } from "@/infrastructure/db/schema/custom-values";
import type { CustomValue } from "@/domain/custom-value/entity";
import type { CustomValueRepository } from "@/domain/custom-value/repository";

function toDomain(row: typeof customValues.$inferSelect): CustomValue {
  return {
    id: row.id,
    customFieldId: row.customFieldId,
    customizedType: row.customizedType as "Issue",
    customizedId: row.customizedId,
    value: row.value,
  };
}

export class DrizzleCustomValueRepository implements CustomValueRepository {
  async listForCustomized(customizedType: "Issue", customizedId: string): Promise<CustomValue[]> {
    const rows = await db
      .select()
      .from(customValues)
      .where(and(eq(customValues.customizedType, customizedType), eq(customValues.customizedId, customizedId)));
    return rows.map(toDomain);
  }

  async set(
    customFieldId: string,
    customizedType: "Issue",
    customizedId: string,
    value: string | null,
  ): Promise<CustomValue> {
    const [row] = await db
      .insert(customValues)
      .values({ customFieldId, customizedType, customizedId, value })
      .onConflictDoUpdate({
        target: [customValues.customFieldId, customValues.customizedType, customValues.customizedId],
        set: { value },
      })
      .returning();
    return toDomain(row);
  }
}
