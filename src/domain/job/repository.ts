import type { Job } from "./entity";

export interface JobRepository {
  enqueue(jobType: string, payload: unknown): Promise<Job>;
  /** Atomically claims the oldest available pending job (SELECT ... FOR UPDATE SKIP LOCKED) and marks it processing. */
  claimNext(): Promise<Job | null>;
  markDone(id: string): Promise<void>;
  /** Increments attempts; re-queues with a backoff delay, or marks failed once maxAttempts is reached. */
  markFailed(id: string, retryDelayMs: number, maxAttempts: number): Promise<void>;
}
