import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { documents } from "@/infrastructure/db/schema/documents";
import { enumerations } from "@/infrastructure/db/schema/enumerations";
import { issues } from "@/infrastructure/db/schema/issues";
import { timeEntries } from "@/infrastructure/db/schema/time-entries";
import type { Positioned } from "@/domain/ordering/positioned";
import type { Enumeration, EnumerationType } from "@/domain/enumeration/entity";
import type { EnumerationAdminRepository, EnumerationRepository } from "@/domain/enumeration/repository";

function toDomain(row: typeof enumerations.$inferSelect): Enumeration {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    position: row.position,
    isDefault: row.isDefault !== 0,
    projectId: row.projectId,
    parentId: row.parentId,
  };
}

export class DrizzleEnumerationRepository implements EnumerationRepository, EnumerationAdminRepository {
  async listByType(type: EnumerationType): Promise<Enumeration[]> {
    // See DrizzleIssueStatusRepository#listAll for why the id tiebreak is needed.
    const rows = await db
      .select()
      .from(enumerations)
      .where(eq(enumerations.type, type))
      .orderBy(enumerations.position, enumerations.id);
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Enumeration | null> {
    const [row] = await db.select().from(enumerations).where(eq(enumerations.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async create(enumeration: Omit<Enumeration, "id">): Promise<Enumeration> {
    const [row] = await db
      .insert(enumerations)
      .values({
        type: enumeration.type,
        name: enumeration.name,
        position: enumeration.position,
        isDefault: enumeration.isDefault ? 1 : 0,
        projectId: enumeration.projectId,
        parentId: enumeration.parentId,
      })
      .returning();
    return toDomain(row);
  }

  async unsetSystemDefaultsForType(type: EnumerationType): Promise<void> {
    await db
      .update(enumerations)
      .set({ isDefault: 0 })
      .where(and(eq(enumerations.type, type), isNull(enumerations.projectId)));
  }

  async update(id: string, changes: Pick<Enumeration, "name" | "isDefault">): Promise<Enumeration> {
    const [row] = await db
      .update(enumerations)
      .set({ name: changes.name, isDefault: changes.isDefault ? 1 : 0 })
      .where(eq(enumerations.id, id))
      .returning();
    return toDomain(row);
  }

  async delete(id: string): Promise<void> {
    // The project overrides pointing at this row via parent_id cascade with it, matching
    // Redmine's acts_as_tree dependent destroy.
    await db.delete(enumerations).where(eq(enumerations.id, id));
  }

  /** Redmine's TimeEntryActivity#objects spans self_and_descendants(1) — the row plus its direct overrides. */
  private async selfAndOverrideIds(id: string): Promise<string[]> {
    const children = await db
      .select({ id: enumerations.id })
      .from(enumerations)
      .where(eq(enumerations.parentId, id));
    return [id, ...children.map((child) => child.id)];
  }

  async countObjectsUsing(enumeration: Pick<Enumeration, "id" | "type">): Promise<number> {
    if (enumeration.type === "IssuePriority") {
      const [row] = await db.select({ value: count() }).from(issues).where(eq(issues.priorityId, enumeration.id));
      return row?.value ?? 0;
    }
    if (enumeration.type === "DocumentCategory") {
      const [row] = await db
        .select({ value: count() })
        .from(documents)
        .where(eq(documents.categoryId, enumeration.id));
      return row?.value ?? 0;
    }
    const ids = await this.selfAndOverrideIds(enumeration.id);
    const [row] = await db.select({ value: count() }).from(timeEntries).where(inArray(timeEntries.activityId, ids));
    return row?.value ?? 0;
  }

  async transferRelations(enumeration: Pick<Enumeration, "id" | "type">, toId: string): Promise<void> {
    if (enumeration.type === "IssuePriority") {
      await db.update(issues).set({ priorityId: toId }).where(eq(issues.priorityId, enumeration.id));
      return;
    }
    if (enumeration.type === "DocumentCategory") {
      await db.update(documents).set({ categoryId: toId }).where(eq(documents.categoryId, enumeration.id));
      return;
    }
    const ids = await this.selfAndOverrideIds(enumeration.id);
    await db.update(timeEntries).set({ activityId: toId }).where(inArray(timeEntries.activityId, ids));
  }

  async updatePositions(positions: Positioned[]): Promise<void> {
    for (const { id, position } of positions) {
      await db.update(enumerations).set({ position }).where(eq(enumerations.id, id));
    }
  }
}
