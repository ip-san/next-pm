import type { TimeEntry } from "@/domain/time-entry/entity";
import type { TimeEntryRepository } from "@/domain/time-entry/repository";

export class InvalidTimeEntryError extends Error {}

export interface LogTimeInput {
  projectId: string;
  issueId: string | null;
  userId: string;
  authorId: string;
  activityId: string;
  hours: number;
  comments: string;
  spentOn: string;
}

/** Mirrors TimeEntry's validates_numericality_of :hours plus Redmine's implicit hours > 0 UI constraint. */
export async function logTime(
  repositories: { timeEntryRepository: TimeEntryRepository },
  input: LogTimeInput,
): Promise<TimeEntry> {
  if (!Number.isFinite(input.hours) || input.hours <= 0) {
    throw new InvalidTimeEntryError("作業時間は0より大きい数値を入力してください。");
  }

  return repositories.timeEntryRepository.create({
    projectId: input.projectId,
    issueId: input.issueId,
    userId: input.userId,
    authorId: input.authorId,
    activityId: input.activityId,
    hours: input.hours,
    comments: input.comments,
    spentOn: input.spentOn,
  });
}
