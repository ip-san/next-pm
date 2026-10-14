import type { IssueRepository } from "@/domain/issue/repository";
import type { TimeEntry } from "@/domain/time-entry/entity";
import type { TimeEntryUpdate } from "@/domain/time-entry/repository";
import { assertActivityAvailable, assertValidHours, InvalidTimeEntryError, type TimeEntryWriteRepositories } from "./log-time";

export { InvalidTimeEntryError };

export interface UpdateTimeEntryInput {
  /**
   * The project to move the entry to. The caller has checked the actor may log time there. The entry's issue has to
   * belong to it afterwards, so a move either names an issue of that project, clears the issue, or fails.
   */
  projectId?: string;
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
 * The project changes only when the caller names one (bulk edit's target project, or the project of a newly chosen
 * issue, as TimeEntry#safe_attributes= sets it).
 */
export async function updateTimeEntry(
  repositories: TimeEntryWriteRepositories & { issueRepository: IssueRepository },
  entry: TimeEntry,
  input: UpdateTimeEntryInput,
): Promise<TimeEntry> {
  if (input.hours !== undefined) {
    await assertValidHours(repositories.settingsRepository, input.hours);
  }
  const projectId = input.projectId ?? entry.projectId;
  // `errors.add :activity_id, :inclusion if activity_id_changed? && project && !project.activities.include?(activity)`
  if (input.activityId !== undefined && input.activityId !== entry.activityId) {
    await assertActivityAvailable(repositories, projectId, input.activityId);
  }
  // `errors.add :issue_id, :invalid if (issue_id && !issue) || (issue && project != issue.project)`, which also
  // holds the issue an entry keeps when only its project moves.
  const issueId = input.issueId !== undefined ? input.issueId : entry.issueId;
  if (issueId !== null && (issueId !== entry.issueId || projectId !== entry.projectId)) {
    const issue = await repositories.issueRepository.findById(issueId);
    if (!issue || issue.projectId !== projectId) {
      throw new InvalidTimeEntryError("チケットが見つかりません。");
    }
  }

  const changes: TimeEntryUpdate = {};

  if (projectId !== entry.projectId) changes.projectId = projectId;
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
