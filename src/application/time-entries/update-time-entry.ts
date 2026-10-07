import type { TimeEntry } from "@/domain/time-entry/entity";
import type { TimeEntryRepository, TimeEntryUpdate } from "@/domain/time-entry/repository";
import type { IssueRepository } from "@/domain/issue/repository";
import type { SettingsRepository } from "@/domain/settings/repository";
import { assertValidHours, InvalidTimeEntryError } from "./log-time";

export { InvalidTimeEntryError };

export interface UpdateTimeEntryInput {
  issueId?: string | null;
  userId?: string;
  activityId?: string;
  hours?: number;
  comments?: string;
  spentOn?: string;
}

/**
 * Applies an edit to an existing entry. The caller has already run TimelogController's
 * `check_editability` (domain/time-entry/visibility.ts) and, when `userId` changes, the
 * `log_time_for_other_users` + assignable-user checks — what's left here are the model-level
 * validations `TimeEntry#validate_time_entry` runs on save:
 *   - hours must still pass the same numericality/0h rule a fresh entry would,
 *   - `errors.add :issue_id, :invalid if (issue_id && !issue) || (issue && project != issue.project)`.
 * The entry's project is never changed from here: Redmine only moves the project along with
 * the issue, and next-pm's edit form is project-scoped.
 */
export async function updateTimeEntry(
  repositories: {
    timeEntryRepository: TimeEntryRepository;
    settingsRepository: SettingsRepository;
    issueRepository: IssueRepository;
  },
  entry: TimeEntry,
  input: UpdateTimeEntryInput,
): Promise<TimeEntry> {
  if (input.hours !== undefined) {
    await assertValidHours(repositories.settingsRepository, input.hours);
  }

  const changes: TimeEntryUpdate = {};

  if (input.issueId !== undefined && input.issueId !== entry.issueId) {
    if (input.issueId !== null) {
      const issue = await repositories.issueRepository.findById(input.issueId);
      if (!issue || issue.projectId !== entry.projectId) {
        throw new InvalidTimeEntryError("チケットが見つかりません。");
      }
    }
    changes.issueId = input.issueId;
  }
  if (input.userId !== undefined) changes.userId = input.userId;
  if (input.activityId !== undefined) changes.activityId = input.activityId;
  if (input.hours !== undefined) changes.hours = input.hours;
  if (input.comments !== undefined) changes.comments = input.comments;
  if (input.spentOn !== undefined) changes.spentOn = input.spentOn;

  if (Object.keys(changes).length === 0) {
    return entry;
  }
  return repositories.timeEntryRepository.update(entry.id, changes);
}
