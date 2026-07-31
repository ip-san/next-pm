import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { customFields, customFieldsTrackers } from "@/infrastructure/db/schema/custom-fields";
import type { CustomField } from "@/domain/custom-field/entity";
import type { CustomFieldRepository } from "@/domain/custom-field/repository";

async function attachTrackerIds(rows: (typeof customFields.$inferSelect)[]): Promise<CustomField[]> {
  const result: CustomField[] = [];
  for (const row of rows) {
    const trackerRows = await db
      .select({ trackerId: customFieldsTrackers.trackerId })
      .from(customFieldsTrackers)
      .where(eq(customFieldsTrackers.customFieldId, row.id));
    result.push({
      id: row.id,
      name: row.name,
      fieldFormat: row.fieldFormat,
      isRequired: row.isRequired,
      defaultValue: row.defaultValue,
      possibleValues: row.possibleValues,
      position: row.position,
      trackerIds: trackerRows.map((t) => t.trackerId),
    });
  }
  return result;
}

export class DrizzleCustomFieldRepository implements CustomFieldRepository {
  async listAll(): Promise<CustomField[]> {
    const rows = await db.select().from(customFields);
    return attachTrackerIds(rows);
  }

  async findById(id: string): Promise<CustomField | null> {
    const [row] = await db.select().from(customFields).where(eq(customFields.id, id)).limit(1);
    if (!row) return null;
    const [withTrackers] = await attachTrackerIds([row]);
    return withTrackers;
  }

  async listForTracker(trackerId: string): Promise<CustomField[]> {
    const rows = await db
      .select({ field: customFields })
      .from(customFieldsTrackers)
      .innerJoin(customFields, eq(customFieldsTrackers.customFieldId, customFields.id))
      .where(eq(customFieldsTrackers.trackerId, trackerId));
    return attachTrackerIds(rows.map((r) => r.field));
  }

  async create(field: Omit<CustomField, "id">): Promise<CustomField> {
    const [row] = await db
      .insert(customFields)
      .values({
        name: field.name,
        fieldFormat: field.fieldFormat,
        isRequired: field.isRequired,
        defaultValue: field.defaultValue,
        possibleValues: field.possibleValues,
        position: field.position,
      })
      .returning();

    if (field.trackerIds.length > 0) {
      await db
        .insert(customFieldsTrackers)
        .values(field.trackerIds.map((trackerId) => ({ customFieldId: row.id, trackerId })));
    }

    return { ...field, id: row.id };
  }
}
