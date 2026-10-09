import { eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { customFieldEnumerations, customFields, customFieldsRoles, customFieldsTrackers } from "@/infrastructure/db/schema/custom-fields";
import type { CustomField, CustomFieldEnumeration, CustomizedType } from "@/domain/custom-field/entity";
import type { Positioned } from "@/domain/ordering/positioned";
import type { CustomFieldAdminRepository, CustomFieldRepository } from "@/domain/custom-field/repository";
import { normalizeFieldVisibility } from "@/domain/custom-field/visibility";

/**
 * Writes an enumeration field's choices to match `names`, in that order. A name that already exists
 * is reused (so values stored against it keep working); a name that is gone is deactivated, not
 * deleted, as Redmine keeps the row with `active = false`.
 */
async function syncEnumerations(customFieldId: string, names: string[]): Promise<void> {
  const existing = await db
    .select()
    .from(customFieldEnumerations)
    .where(eq(customFieldEnumerations.customFieldId, customFieldId));
  const byName = new Map(existing.map((row) => [row.name, row]));
  const wanted = new Set(names);

  for (const [index, name] of names.entries()) {
    const row = byName.get(name);
    if (row) {
      await db
        .update(customFieldEnumerations)
        .set({ position: index + 1, active: true })
        .where(eq(customFieldEnumerations.id, row.id));
    } else {
      await db
        .insert(customFieldEnumerations)
        .values({ customFieldId, name, position: index + 1, active: true });
    }
  }

  for (const row of existing) {
    if (!wanted.has(row.name) && row.active) {
      await db.update(customFieldEnumerations).set({ active: false }).where(eq(customFieldEnumerations.id, row.id));
    }
  }
}

async function attachTrackerIds(rows: (typeof customFields.$inferSelect)[]): Promise<CustomField[]> {
  // One query for every enumeration choice of the enumeration fields in this batch.
  const enumerationFieldIds = rows.filter((row) => row.fieldFormat === "enumeration").map((row) => row.id);
  const choices =
    enumerationFieldIds.length > 0
      ? await db
          .select()
          .from(customFieldEnumerations)
          .where(inArray(customFieldEnumerations.customFieldId, enumerationFieldIds))
          .orderBy(customFieldEnumerations.position, customFieldEnumerations.name)
      : [];

  const result: CustomField[] = [];
  for (const row of rows) {
    const trackerRows = await db
      .select({ trackerId: customFieldsTrackers.trackerId })
      .from(customFieldsTrackers)
      .where(eq(customFieldsTrackers.customFieldId, row.id));
    const roleRows = await db
      .select({ roleId: customFieldsRoles.roleId })
      .from(customFieldsRoles)
      .where(eq(customFieldsRoles.customFieldId, row.id));
    const enumerations: CustomFieldEnumeration[] = choices
      .filter((choice) => choice.customFieldId === row.id)
      .map((choice) => ({ id: choice.id, name: choice.name, position: choice.position, active: choice.active }));
    result.push({
      enumerations: row.fieldFormat === "enumeration" ? enumerations : undefined,
      id: row.id,
      name: row.name,
      customizedType: row.customizedType as CustomizedType,
      fieldFormat: row.fieldFormat,
      isRequired: row.isRequired,
      defaultValue: row.defaultValue,
      possibleValues: row.possibleValues,
      position: row.position,
      trackerIds: trackerRows.map((t) => t.trackerId),
      visible: row.visible,
      roleIds: roleRows.map((r) => r.roleId),
      multiple: row.multiple,
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
    const visibility = normalizeFieldVisibility(field);
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
        visible: visibility.visible,
        multiple: field.multiple,
      })
      .returning();

    if (visibility.roleIds.length > 0) {
      await db.insert(customFieldsRoles).values(visibility.roleIds.map((roleId) => ({ customFieldId: row.id, roleId })));
    }

    if (field.trackerIds.length > 0) {
      await db
        .insert(customFieldsTrackers)
        .values(field.trackerIds.map((trackerId) => ({ customFieldId: row.id, trackerId })));
    }

    if (field.fieldFormat === "enumeration") {
      await syncEnumerations(row.id, field.possibleValues);
    }

    return { ...field, ...visibility, id: row.id };
  }

  async update(
    id: string,
    changes: Pick<CustomField, "name" | "isRequired" | "defaultValue" | "possibleValues" | "trackerIds" | "visible" | "roleIds">,
  ): Promise<CustomField> {
    const visibility = normalizeFieldVisibility(changes);
    const [row] = await db
      .update(customFields)
      .set({
        name: changes.name,
        isRequired: changes.isRequired,
        defaultValue: changes.defaultValue,
        possibleValues: changes.possibleValues,
        visible: visibility.visible,
      })
      .where(eq(customFields.id, id))
      .returning();

    await db.delete(customFieldsRoles).where(eq(customFieldsRoles.customFieldId, id));
    if (visibility.roleIds.length > 0) {
      await db.insert(customFieldsRoles).values(visibility.roleIds.map((roleId) => ({ customFieldId: id, roleId })));
    }

    if (row.fieldFormat === "enumeration") {
      await syncEnumerations(id, changes.possibleValues);
    }

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
