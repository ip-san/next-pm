import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { customFields, customFieldsTrackers } from "@/infrastructure/db/schema/custom-fields";
import type { CustomField, CustomizedType } from "@/domain/custom-field/entity";
import type { Positioned } from "@/domain/ordering/positioned";
import type { CustomFieldAdminRepository, CustomFieldRepository } from "@/domain/custom-field/repository";

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
      customizedType: row.customizedType as CustomizedType,
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

export class DrizzleCustomFieldRepository implements CustomFieldRepository, CustomFieldAdminRepository {
  async listAll(): Promise<CustomField[]> {
    // See DrizzleIssueStatusRepository#listAll for why the id tiebreak is needed.
    const rows = await db.select().from(customFields).orderBy(customFields.position, customFields.id);
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

  async listForCustomizedType(customizedType: CustomizedType): Promise<CustomField[]> {
    const rows = await db.select().from(customFields).where(eq(customFields.customizedType, customizedType));
    return attachTrackerIds(rows);
  }

  async create(field: Omit<CustomField, "id">): Promise<CustomField> {
    const [row] = await db
      .insert(customFields)
      .values({
        name: field.name,
        customizedType: field.customizedType,
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

  async update(
    id: string,
    changes: Pick<CustomField, "name" | "isRequired" | "defaultValue" | "possibleValues" | "trackerIds">,
  ): Promise<CustomField> {
    const [row] = await db
      .update(customFields)
      .set({
        name: changes.name,
        isRequired: changes.isRequired,
        defaultValue: changes.defaultValue,
        possibleValues: changes.possibleValues,
      })
      .where(eq(customFields.id, id))
      .returning();

    await db.delete(customFieldsTrackers).where(eq(customFieldsTrackers.customFieldId, id));
    if (changes.trackerIds.length > 0) {
      await db
        .insert(customFieldsTrackers)
        .values(changes.trackerIds.map((trackerId) => ({ customFieldId: id, trackerId })));
    }

    const [withTrackers] = await attachTrackerIds([row]);
    return withTrackers;
  }

  async delete(id: string): Promise<void> {
    // custom_values and custom_fields_trackers both cascade on their custom_field FK, which is
    // Redmine's `dependent: :delete_all` — deleting a field discards its stored values.
    await db.delete(customFields).where(eq(customFields.id, id));
  }

  async updatePositions(positions: Positioned[]): Promise<void> {
    for (const { id, position } of positions) {
      await db.update(customFields).set({ position }).where(eq(customFields.id, id));
    }
  }
}
