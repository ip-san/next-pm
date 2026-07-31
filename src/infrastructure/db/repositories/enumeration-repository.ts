import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { enumerations } from "@/infrastructure/db/schema/enumerations";
import type { Enumeration, EnumerationType } from "@/domain/enumeration/entity";
import type { EnumerationRepository } from "@/domain/enumeration/repository";

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

export class DrizzleEnumerationRepository implements EnumerationRepository {
  async listByType(type: EnumerationType): Promise<Enumeration[]> {
    const rows = await db
      .select()
      .from(enumerations)
      .where(eq(enumerations.type, type))
      .orderBy(enumerations.position);
    return rows.map(toDomain);
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
}
