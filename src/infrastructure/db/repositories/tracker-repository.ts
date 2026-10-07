import { count, eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { issues } from "@/infrastructure/db/schema/issues";
import { trackers } from "@/infrastructure/db/schema/trackers";
import type { Positioned } from "@/domain/ordering/positioned";
import type { Tracker } from "@/domain/tracker/entity";
import type { TrackerAdminRepository, TrackerRepository } from "@/domain/tracker/repository";

function toDomain(row: typeof trackers.$inferSelect): Tracker {
  return {
    id: row.id,
    name: row.name,
    defaultStatusId: row.defaultStatusId,
    position: row.position,
    isInRoadmap: row.isInRoadmap,
  };
}

export class DrizzleTrackerRepository implements TrackerRepository, TrackerAdminRepository {
  async findById(id: string): Promise<Tracker | null> {
    const [row] = await db.select().from(trackers).where(eq(trackers.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByIds(ids: string[]): Promise<Tracker[]> {
    if (ids.length === 0) return [];
    const rows = await db.select().from(trackers).where(inArray(trackers.id, ids));
    return rows.map(toDomain);
  }

  async listAll(): Promise<Tracker[]> {
    // See DrizzleIssueStatusRepository#listAll for why the id tiebreak is needed.
    const rows = await db.select().from(trackers).orderBy(trackers.position, trackers.id);
    return rows.map(toDomain);
  }

  async create(tracker: Omit<Tracker, "id">): Promise<Tracker> {
    const [row] = await db
      .insert(trackers)
      .values({
        name: tracker.name,
        defaultStatusId: tracker.defaultStatusId,
        position: tracker.position,
        isInRoadmap: tracker.isInRoadmap,
      })
      .returning();
    return toDomain(row);
  }

  async update(id: string, changes: Pick<Tracker, "name" | "defaultStatusId" | "isInRoadmap">): Promise<Tracker> {
    const [row] = await db.update(trackers).set(changes).where(eq(trackers.id, id)).returning();
    return toDomain(row);
  }

  async delete(id: string): Promise<void> {
    // workflow rows, project_trackers and custom_fields_trackers all cascade on their tracker FK.
    await db.delete(trackers).where(eq(trackers.id, id));
  }

  async countIssuesUsing(id: string): Promise<number> {
    const [row] = await db.select({ value: count() }).from(issues).where(eq(issues.trackerId, id));
    return row?.value ?? 0;
  }

  async updatePositions(positions: Positioned[]): Promise<void> {
    for (const { id, position } of positions) {
      await db.update(trackers).set({ position }).where(eq(trackers.id, id));
    }
  }
}
