import { eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { trackers } from "@/infrastructure/db/schema/trackers";
import type { Tracker } from "@/domain/tracker/entity";
import type { TrackerRepository } from "@/domain/tracker/repository";

function toDomain(row: typeof trackers.$inferSelect): Tracker {
  return {
    id: row.id,
    name: row.name,
    defaultStatusId: row.defaultStatusId,
    position: row.position,
    isInRoadmap: row.isInRoadmap,
  };
}

export class DrizzleTrackerRepository implements TrackerRepository {
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
    const rows = await db.select().from(trackers).orderBy(trackers.position);
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
}
