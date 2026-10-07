import type { IssueRepository } from "@/domain/issue/repository";
import type { TimeEntry } from "@/domain/time-entry/entity";
import type { TimeEntryUpdate } from "@/domain/time-entry/repository";
import { assertActivityAvailable, assertValidHours, InvalidTimeEntryError, type TimeEntryWriteRepositories } from "./log-time";

export { InvalidTimeEntryError };

export interface UpdateTimeEntryInput {
  /**
   * The *authorization* half is the caller's: the interface layer runs
   * `canAttachIssueToTimeEntry` over the target issue (visible to the actor, and the actor
   * holds `log_time` there). The structural half — the issue exists and belongs to this
   * entry's project — is re-checked here, so a caller that forgets can at worst produce an
   * error, never an entry pointing into another project.
   */
  issueId?: string | null;
  /** Already authorized by the caller via `canAttributeTimeEntryTo`. */
  userId?: string;
  activityId?: string;
  hours?: number;
  comments?: string;
  spentOn?: string;
}

/**
 * Applies an edit to an existing entry. The caller has already run TimelogController's
 * `check_editability` (domain/time-entry/visibility.ts) and the per-field authorization
 * noted above; what's left here are the model-level validations
 * `TimeEntry#validate_time_entry` runs on save — the hours rule and the activity rule, both
 * shared with logTime so an edit can't put an entry into a state creating it would have
 * rejected.
 *
 * The entry's project is never changed from here: Redmine only moves the project along with
 * the issue, and next-pm's edit form is project-scoped.
 */
export async function updateTimeEntry(
  repositories: TimeEntryWriteRepositories & { issueRepository: IssueRepository },
  entry: TimeEntry,
  input: UpdateTimeEntryInput,
): Promise<TimeEntry> {
  if (input.hours !== undefined) {
    await assertValidHours(repositories.settingsRepository, input.hours);
  }
  if (input.activityId !== undefined && input.activityId !== entry.activityId) {
    await assertActivityAvailable(repositories, entry.projectId, input.activityId);
  }
  // `errors.add :issue_id, :invalid if (issue_id && !issue) || (issue && project != issue.project)`
  if (input.issueId !== undefined && input.issueId !== entry.issueId && input.issueId !== null) {
    const issue = await repositories.issueRepository.findById(input.issueId);
    if (!issue || issue.projectId !== entry.projectId) {
      throw new InvalidTimeEntryError("チケットが見つかりません。");
    }
  }

  const changes: TimeEntryUpdate = {};

  if (input.issueId !== undefined && input.issueId !== entry.issueId) changes.issueId = input.issueId;
  if (input.userId !== undefined && input.userId !== entry.userId) changes.userId = input.userId;
  if (input.activityId !== undefined && input.activityId !== entry.activityId) changes.activityId = input.activityId;
  if (input.hours !== undefined && input.hours !== entry.hours) changes.hours = input.hours;
  if (input.comments !== undefined && input.comments !== entry.comments) changes.comments = input.comments;
  if (input.spentOn !== undefined && input.spentOn !== entry.spentOn) changes.spentOn = input.spentOn;

  if (Object.keys(changes).length === 0) {
    return entry;
  }
  return repositories.timeEntryRepository.update(entry.id, changes);
}
