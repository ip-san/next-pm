import type { TimeEntry } from "@/domain/time-entry/entity";
import type { TimeEntryRepository } from "@/domain/time-entry/repository";
import { resolveGeneralSettings } from "@/domain/settings/general-settings";
import type { SettingsRepository } from "@/domain/settings/repository";

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

/**
 * Mirrors TimeEntry's validates_numericality_of :hours plus Redmine's `timelog_accept_0_hours`
 * setting (default: reject 0h unless explicitly allowed). Shared with updateTimeEntry so an
 * edit can't put an entry into a state creating it would have rejected.
 */
export async function assertValidHours(settingsRepository: SettingsRepository, hours: number): Promise<void> {
  const { timelogAccept0Hours } = resolveGeneralSettings(await settingsRepository.getAll());
  const invalid = !Number.isFinite(hours) || hours < 0 || (hours === 0 && !timelogAccept0Hours);
  if (invalid) {
    throw new InvalidTimeEntryError(
      timelogAccept0Hours ? "作業時間は0以上の数値を入力してください。" : "作業時間は0より大きい数値を入力してください。",
    );
  }
}

export async function logTime(
  repositories: { timeEntryRepository: TimeEntryRepository; settingsRepository: SettingsRepository },
  input: LogTimeInput,
): Promise<TimeEntry> {
  await assertValidHours(repositories.settingsRepository, input.hours);

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
