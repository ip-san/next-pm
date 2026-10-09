import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { customValues } from "@/infrastructure/db/schema/custom-values";
import type { CustomizedType } from "@/domain/custom-field/entity";
import type { CustomValue } from "@/domain/custom-value/entity";
import type { CustomValueRepository } from "@/domain/custom-value/repository";
import { storedRowsFor, valueFromStoredRows } from "@/domain/custom-value/storage";
import { customFields } from "@/infrastructure/db/schema/custom-fields";

function toDomain(row: typeof customValues.$inferSelect): CustomValue {
  return {
    id: row.id,
    customFieldId: row.customFieldId,
    customizedType: row.customizedType as CustomizedType,
    customizedId: row.customizedId,
    value: row.value,
  };
}

/**
 * One CustomValue per field. A multiple-valued field is stored as one row per value; it is read back as the
 * values joined by the separator, so callers see the same shape for single and multiple fields.
 */
function aggregate(rows: (typeof customValues.$inferSelect)[]): CustomValue[] {
  const byField = new Map<string, (typeof customValues.$inferSelect)[]>();
  for (const row of rows) {
    byField.set(row.customFieldId, [...(byField.get(row.customFieldId) ?? []), row]);
  }
  return [...byField.values()].map((group) => {
    const values = group.map((row) => row.value).filter((value): value is string => value !== null && value.length > 0);
    return { ...toDomain(group[0]), value: valueFromStoredRows(values) };
  });
}

export class DrizzleCustomValueRepository implements CustomValueRepository {
  async listForCustomized(customizedType: CustomizedType, customizedId: string): Promise<CustomValue[]> {
    const rows = await db
      .select()
      .from(customValues)
      .where(and(eq(customValues.customizedType, customizedType), eq(customValues.customizedId, customizedId)))
      .orderBy(customValues.value);
    return aggregate(rows);
  }

  /**
   * Replaces the field's stored value on the record. A multiple-valued field's value is split into one row per value
   * (one value per line); any other field's value is stored whole. An empty value clears the field.
   */
  async set(
    customFieldId: string,
    customizedType: CustomizedType,
    customizedId: string,
    value: string | null,
  ): Promise<CustomValue> {
    const [field] = await db.select({ multiple: customFields.multiple }).from(customFields).where(eq(customFields.id, customFieldId)).limit(1);
    const rows = storedRowsFor(field?.multiple ?? false, value);
    await db.transaction(async (tx) => {
      await tx
        .delete(customValues)
        .where(
          and(
            eq(customValues.customFieldId, customFieldId),
            eq(customValues.customizedType, customizedType),
            eq(customValues.customizedId, customizedId),
          ),
        );
      if (rows.length > 0) {
        await tx.insert(customValues).values(rows.map((item) => ({ customFieldId, customizedType, customizedId, value: item })));
      }
    });
    return { id: "", customFieldId, customizedType, customizedId, value: valueFromStoredRows(rows) };
  }

  async deleteForCustomized(customizedType: CustomizedType, customizedId: string): Promise<void> {
    await db
      .delete(customValues)
      .where(and(eq(customValues.customizedType, customizedType), eq(customValues.customizedId, customizedId)));
  }
}
