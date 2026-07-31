import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { jobs } from "@/infrastructure/db/schema/jobs";
import type { Job, JobStatus } from "@/domain/job/entity";
import type { JobRepository } from "@/domain/job/repository";

function toDomain(row: typeof jobs.$inferSelect): Job {
  return {
    id: row.id,
    jobType: row.jobType,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    availableAt: row.availableAt,
    createdAt: row.createdAt,
  };
}

export class DrizzleJobRepository implements JobRepository {
  async enqueue(jobType: string, payload: unknown): Promise<Job> {
    const [row] = await db.insert(jobs).values({ jobType, payload }).returning();
    return toDomain(row);
  }

  async claimNext(): Promise<Job | null> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.status, "pending" as JobStatus), lte(jobs.availableAt, sql`now()`)))
        .orderBy(asc(jobs.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });

      if (!row) {
        return null;
      }

      const [claimed] = await tx.update(jobs).set({ status: "processing" }).where(eq(jobs.id, row.id)).returning();
      return toDomain(claimed);
    });
  }

  async markDone(id: string): Promise<void> {
    await db.update(jobs).set({ status: "done" }).where(eq(jobs.id, id));
  }

  async markFailed(id: string, retryDelayMs: number, maxAttempts: number): Promise<void> {
    const [row] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    if (!row) return;

    const attempts = row.attempts + 1;
    if (attempts >= maxAttempts) {
      await db.update(jobs).set({ status: "failed", attempts }).where(eq(jobs.id, id));
      return;
    }

    await db
      .update(jobs)
      .set({ status: "pending", attempts, availableAt: new Date(Date.now() + retryDelayMs) })
      .where(eq(jobs.id, id));
  }
}
