import type { EnumerationRepository } from "@/domain/enumeration/repository";
import type { TimeEntry } from "@/domain/time-entry/entity";
import type { TimeEntryRepository } from "@/domain/time-entry/repository";
import { resolveGeneralSettings } from "@/domain/settings/general-settings";
import type { SettingsRepository } from "@/domain/settings/repository";

export class InvalidTimeEntryError extends Error {}

export interface TimeEntryWriteRepositories {
  timeEntryRepository: TimeEntryRepository;
  settingsRepository: SettingsRepository;
  enumerationRepository: EnumerationRepository;
}

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

/**
 * Mirrors `errors.add :activity_id, :inclusion if activity_id_changed? && project &&
 * !project.activities.include?(activity)`. Without this, any enumeration id at all — an
 * issue priority, another project's activity — is accepted, because the only thing
 * standing behind the column is a foreign key to `enumerations`.
 *
 * `project.activities` in Redmine also excludes a system-wide activity that this project
 * has overridden with its own row; that refinement needs the parent/child override pair to
 * be resolved per project, which no caller here can express yet, so a system-wide activity
 * stays acceptable.
 */
export async function assertActivityAvailable(
  enumerationRepository: EnumerationRepository,
  projectId: string,
  activityId: string,
): Promise<void> {
  const activities = await enumerationRepository.listByType("TimeEntryActivity");
  const activity = activities.find((candidate) => candidate.id === activityId);
  if (!activity || (activity.projectId !== null && activity.projectId !== projectId)) {
    throw new InvalidTimeEntryError("作業分類が不正です。");
  }
}

export async function logTime(repositories: TimeEntryWriteRepositories, input: LogTimeInput): Promise<TimeEntry> {
  await assertValidHours(repositories.settingsRepository, input.hours);
  await assertActivityAvailable(repositories.enumerationRepository, input.projectId, input.activityId);

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
