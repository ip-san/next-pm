export type JobStatus = "pending" | "processing" | "done" | "failed";

export interface Job {
  id: string;
  jobType: string;
  payload: unknown;
  status: JobStatus;
  attempts: number;
  availableAt: Date;
  createdAt: Date;
}
