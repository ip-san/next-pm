import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { enumerations } from "@/infrastructure/db/schema/enumerations";
import { timeEntries } from "@/infrastructure/db/schema/time-entries";
import type { Enumeration } from "@/domain/enumeration/entity";
import type { ProjectActivityRepository } from "@/domain/enumeration/project-activity-repository";

function toDomain(row: typeof enumerations.$inferSelect): Enumeration {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    position: row.position,
    isDefault: row.isDefault !== 0,
    active: row.active,
    projectId: row.projectId,
    parentId: row.parentId,
  };
}

export class DrizzleProjectActivityRepository implements ProjectActivityRepository {
  async listOverridesForProject(projectId: string): Promise<Enumeration[]> {
    const rows = await db
      .select()
      .from(enumerations)
      .where(and(eq(enumerations.type, "TimeEntryActivity"), eq(enumerations.projectId, projectId)))
      .orderBy(enumerations.position, enumerations.id);
    return rows.map(toDomain);
  }

  async createOverride(input: { projectId: string; parent: Enumeration; active: boolean }): Promise<Enumeration> {
    // Name and position are copied from the parent, like
    // Project#create_time_entry_activity_if_needed does, so the override sorts and reads
    // identically to the activity it stands in for.
    const [row] = await db
      .insert(enumerations)
      .values({
        type: "TimeEntryActivity",
        name: input.parent.name,
        position: input.parent.position,
        isDefault: 0,
        active: input.active,
        projectId: input.projectId,
        parentId: input.parent.id,
      })
      .returning();
    return toDomain(row);
  }

  async updateOverride(id: string, changes: { active: boolean }): Promise<void> {
    await db.update(enumerations).set({ active: changes.active }).where(eq(enumerations.id, id));
  }

  async deleteOverride(id: string): Promise<void> {
    await db.delete(enumerations).where(eq(enumerations.id, id));
  }

  async reassignTimeEntries(projectId: string, fromActivityId: string, toActivityId: string): Promise<void> {
    await db
      .update(timeEntries)
      .set({ activityId: toActivityId })
      .where(and(eq(timeEntries.projectId, projectId), eq(timeEntries.activityId, fromActivityId)));
  }
}
