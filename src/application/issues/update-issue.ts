import type { CustomFieldRepository } from "@/domain/custom-field/repository";
import type { CustomValueRepository } from "@/domain/custom-value/repository";
import { diffIssueChanges } from "@/domain/journal/diff-issue";
import { splitPrivateNote } from "@/domain/journal/visibility";
import { isCoreFieldDisabled, TRACKER_CORE_FIELDS } from "@/domain/tracker/core-fields";
import type { JournalRepository } from "@/domain/journal/repository";
import type { Issue } from "@/domain/issue/entity";
import type { IssueRepository, IssueUpdate } from "@/domain/issue/repository";
import { computeRescheduledDates, computeSoonestStart } from "@/domain/issue-relation/reschedule";
import type { IssueRelationRepository } from "@/domain/issue-relation/repository";
import type { IssueStatusRepository } from "@/domain/issue-status/repository";
import { resolveGeneralSettings } from "@/domain/settings/general-settings";
import type { SettingsRepository } from "@/domain/settings/repository";
import type { UserPreferencesRepository } from "@/domain/user-preferences/repository";
import type { WatcherRepository } from "@/domain/watcher/repository";
import { wouldCreateParentCycle } from "@/domain/issue/parent";
import { isFieldBlank } from "@/domain/workflow/blank";
import { applyAutoWatch } from "@/application/watchers/apply-auto-watch";
import { applyIssueCustomFieldValues, prepareIssueCustomFieldValues } from "@/application/issues/set-custom-field-values";
import { assertIssueAttributesAssignable, type IssueAttributeRepositories } from "@/application/issues/validate-issue-attributes";
import { recalculateParents } from "@/application/issues/recalculate-parents";
import { readOnlyAttributeNames, requiredAttributeNames } from "@/domain/workflow/field-permission-rules";
import { canTransitionTo } from "@/domain/workflow/transition-rules";
import type { WorkflowEligibleField } from "@/domain/workflow/entity";
import type { WorkflowFieldPermissionRepository, WorkflowRepository } from "@/domain/workflow/repository";

export class WorkflowTransitionDeniedError extends Error {
  constructor(from: string, to: string) {
    super(`Transition from status ${from} to ${to} is not allowed for this role/tracker.`);
    this.name = "WorkflowTransitionDeniedError";
  }
}

export class WorkflowRequiredFieldError extends Error {
  constructor(public readonly fieldName: WorkflowEligibleField) {
    super(`Field "${fieldName}" is required in this status for this role and cannot be blank.`);
    this.name = "WorkflowRequiredFieldError";
  }
}

export class InvalidParentIssueError extends Error {
  constructor(public readonly reason: "not_found" | "cross_project" | "cycle") {
    super(`The requested parent issue is not valid for this issue (${reason}).`);
    this.name = "InvalidParentIssueError";
  }
}

export class BlockedIssueCloseError extends Error {
  constructor() {
    super("This issue cannot be closed because it is blocked by another open issue.");
    this.name = "BlockedIssueCloseError";
  }
}

export interface UpdateIssueInput {
  issueId: string;
  expectedLockVersion: number;
  changes: IssueUpdate;
  /**
   * customFieldId -> raw string input, partial-update semantics (omitted field = untouched).
   * Validated before the issue row is written and journalled in the same entry as `changes`,
   * mirroring Redmine's single Journal carrying both `attr` and `cf` details.
   */
  customFieldValues?: Record<string, string>;
  notes: string;
  actingUserId: string;
  actorRoleIds: string[];
  isAuthor: boolean;
  isAssignee: boolean;
  /**
   * `set_issues_private`, or `set_own_issues_private` when the actor is the author. False
   * silently drops `isPrivate` from the update, mirroring Redmine's safe_attributes
   * omitting an attribute the actor may not set rather than rejecting the whole save.
   * Optional because the internal cascades below carry no actor permissions and never
   * touch either field.
   */
  canSetPrivate?: boolean;
  /** `manage_subtasks`; false silently drops `parentId`. */
  canManageSubtasks?: boolean;
  /**
   * `edit_issues`, or `edit_own_issues` on one's own issue. False drops every attribute
   * change and custom value, leaving a notes-only update — Redmine's `attributes_editable?`
   * gates the whole `safe_attributes` block that way. Defaults to true so the internal
   * cascades, which carry no acting-user permissions, keep working.
   */
  canEditAttributes?: boolean;
  /** `add_issue_notes` (Redmine's `notes_addable?`). False drops the note. */
  canAddNotes?: boolean;
  /** Mark the note private. Requires `set_notes_private`; false otherwise (fails closed). */
  privateNotes?: boolean;
  canSetNotesPrivate?: boolean;
}

/**
 * What the update actually stored. Callers that notify must build the message from this and
 * never from their own request body: a note the actor wasn't allowed to add is dropped from
 * the journal, and mailing it anyway would deliver it to every recipient while leaving no
 * record anyone could audit.
 */
export interface UpdateIssueOutcome {
  issue: Issue;
  /** The note as persisted — "" when none was stored (dropped for permissions, or blank). */
  persistedNotes: string;
  /** Whether the stored note ended up private, after the blank/split rules. */
  persistedNotesPrivate: boolean;
}

export interface UpdateIssueRepositories extends IssueAttributeRepositories {
  issueRepository: IssueRepository;
  journalRepository: JournalRepository;
  workflowRepository: WorkflowRepository;
  workflowFieldPermissionRepository: WorkflowFieldPermissionRepository;
  issueStatusRepository: IssueStatusRepository;
  issueRelationRepository: IssueRelationRepository;
  settingsRepository: SettingsRepository;
  userPreferencesRepository: UserPreferencesRepository;
  watcherRepository: WatcherRepository;
  customFieldRepository: CustomFieldRepository;
  customValueRepository: CustomValueRepository;
}

export async function updateIssue(repositories: UpdateIssueRepositories, input: UpdateIssueInput): Promise<UpdateIssueOutcome> {
  const { after, appliedChanges, persistedNotes, persistedNotesPrivate } = await applyIssueUpdate(repositories, input, {
    skipTransitionCheck: false,
    skipBlockedCheck: false,
    skipFieldPermissions: false,
  });

  // Mirrors Redmine's Issue#close_duplicates, invoked from after_save whenever the status
  // just became closed: every issue that duplicates this one is closed too, cascading through
  // chains of duplicates. Uses update_attribute in Redmine — validations are bypassed for the
  // cascade, which is why closeDuplicate below skips the transition/blocked checks but still
  // goes through applyIssueUpdate for the journal entry, done_ratio derivation, and auto-watch.
  // Keyed on `appliedChanges`, not the submitted payload: a field the actor wasn't allowed
  // to set (notes-only actor, or a workflow read-only rule) is stripped before the write, and
  // must not still trigger a cascade that rewrites *other* issues.
  if (appliedChanges.statusId && after.statusId === appliedChanges.statusId) {
    const targetStatus = await repositories.issueStatusRepository.findById(after.statusId);
    if (targetStatus?.isClosed) {
      await closeDuplicates(repositories, input.issueId, after.statusId, input.actingUserId, input.actorRoleIds, new Set([input.issueId]));
    }
  }

  // Mirrors Redmine's Issue#reschedule_following_issues, invoked from after_save whenever
  // start_date or due_date actually changed: every "precedes" successor gets pushed forward
  // to keep up, cascading through chains.
  const startDateChanged = appliedChanges.startDate !== undefined && after.startDate === appliedChanges.startDate;
  const dueDateChanged = appliedChanges.dueDate !== undefined && after.dueDate === appliedChanges.dueDate;
  if (startDateChanged || dueDateChanged) {
    await rescheduleFollowingIssues(repositories, input.issueId, input.actingUserId, new Set([input.issueId]));
  }

  return { issue: after, persistedNotes, persistedNotesPrivate };
}

/**
 * Closes every issue that duplicates `issueId` (relationType "duplicates", issueToId ===
 * issueId — the canonical row points from the duplicate to the issue it duplicates), then
 * recurses into each of those for chained duplicates. `visited` guards against cycles and
 * re-visiting a branch through a different path in a diamond-shaped duplicate graph.
 */
async function closeDuplicates(
  repositories: UpdateIssueRepositories,
  issueId: string,
  closedStatusId: string,
  actingUserId: string,
  actorRoleIds: string[],
  visited: Set<string>,
): Promise<void> {
  const relations = await repositories.issueRelationRepository.listForIssue(issueId);
  const duplicateIds = relations.filter((r) => r.relationType === "duplicates" && r.issueToId === issueId).map((r) => r.issueFromId);

  for (const duplicateId of duplicateIds) {
    if (visited.has(duplicateId)) continue;
    visited.add(duplicateId);

    const duplicate = await repositories.issueRepository.findById(duplicateId);
    if (!duplicate) continue;
    const currentStatus = await repositories.issueStatusRepository.findById(duplicate.statusId);
    if (currentStatus?.isClosed) continue; // already closed — mirrors `next if duplicate.closed?`

    try {
      await applyIssueUpdate(
        repositories,
        {
          issueId: duplicateId,
          expectedLockVersion: duplicate.lockVersion,
          changes: { statusId: closedStatusId },
          notes: "",
          actingUserId,
          actorRoleIds,
          isAuthor: duplicate.authorId === actingUserId,
          isAssignee: duplicate.assignedToId === actingUserId,
        },
        { skipTransitionCheck: true, skipBlockedCheck: true, skipFieldPermissions: false },
      );
    } catch {
      // A per-duplicate failure (e.g. a required field this cascade can't fill in) must not
      // abort the primary close that triggered this cascade — leave this branch untouched.
      continue;
    }

    await closeDuplicates(repositories, duplicateId, closedStatusId, actingUserId, actorRoleIds, visited);
  }
}

/**
 * Pushes every "precedes" successor of `issueId` (relationType "precedes", issueFromId ===
 * issueId) forward to keep up with its predecessors, recursing through chains. Mirrors
 * Redmine's Issue#reschedule_following_issues -> IssueRelation#set_issue_to_dates ->
 * Issue#soonest_start -> Issue#reschedule_after. Crucially, soonestStart is recomputed from
 * *every* "precedes" relation pointing at the successor, not just the one that got us here —
 * a successor with several predecessors must wait for the latest one.
 *
 * This is a direct attribute-assignment-then-save in Redmine (bypasses safe_attributes
 * filtering entirely), so — like closeDuplicates — the cascade skips transition/blocked
 * checks. Unlike closeDuplicates, it also skips field-permission read-only/required checks:
 * there's no acting user's role driving this cascade, and Redmine's raw model save has no
 * equivalent of workflow field permissions to begin with.
 */
async function rescheduleFollowingIssues(
  repositories: UpdateIssueRepositories,
  issueId: string,
  actingUserId: string,
  visited: Set<string>,
): Promise<void> {
  const relations = await repositories.issueRelationRepository.listForIssue(issueId);
  const successorIds = relations.filter((r) => r.relationType === "precedes" && r.issueFromId === issueId).map((r) => r.issueToId);

  for (const successorId of successorIds) {
    if (visited.has(successorId)) continue;

    const successorRelations = await repositories.issueRelationRepository.listForIssue(successorId);
    const predecessorRelations = successorRelations.filter((r) => r.relationType === "precedes" && r.issueToId === successorId);
    const predecessors = await Promise.all(
      predecessorRelations.map(async (relation) => {
        const predecessor = await repositories.issueRepository.findById(relation.issueFromId);
        return { startDate: predecessor?.startDate ?? null, dueDate: predecessor?.dueDate ?? null, delay: relation.delay };
      }),
    );
    const soonestStart = computeSoonestStart(predecessors);
    if (!soonestStart) continue;

    const successor = await repositories.issueRepository.findById(successorId);
    if (!successor) continue;
    const rescheduled = computeRescheduledDates(successor, soonestStart);
    if (!rescheduled) continue;

    visited.add(successorId);

    try {
      await applyIssueUpdate(
        repositories,
        {
          issueId: successorId,
          expectedLockVersion: successor.lockVersion,
          changes: { startDate: rescheduled.startDate, dueDate: rescheduled.dueDate },
          notes: "",
          actingUserId,
          actorRoleIds: [],
          isAuthor: false,
          isAssignee: false,
        },
        { skipTransitionCheck: true, skipBlockedCheck: true, skipFieldPermissions: true },
      );
    } catch {
      // Mirrors closeDuplicates: a per-successor failure (e.g. a stale lock_version from a
      // concurrent edit) must not abort the primary update that triggered this cascade.
      continue;
    }

    await rescheduleFollowingIssues(repositories, successorId, actingUserId, visited);
  }
}

async function applyIssueUpdate(
  repositories: UpdateIssueRepositories,
  input: UpdateIssueInput,
  options: { skipTransitionCheck: boolean; skipBlockedCheck: boolean; skipFieldPermissions: boolean },
): Promise<{ after: Issue; appliedChanges: IssueUpdate; persistedNotes: string; persistedNotesPrivate: boolean }> {
  const before = await repositories.issueRepository.findById(input.issueId);
  if (!before) {
    throw new Error(`Issue ${input.issueId} not found`);
  }

  // Permission filtering happens before anything else reads the payload. Mirrors Redmine's
  // Issue#safe_attributes: the attribute block is gated on attributes_editable? and `notes`
  // separately on notes_addable?, so a user with only add_issue_notes can comment without
  // being able to change anything — including which tracker's workflow is consulted.
  const requested = input.canEditAttributes === false ? ({} as IssueUpdate) : { ...input.changes };
  const notes = input.canAddNotes === false ? "" : input.notes;
  const customFieldValues = input.canEditAttributes === false ? undefined : input.customFieldValues;

  // Mirrors Redmine's Issue#safe_attributes=, which assigns tracker_id from the submitted
  // params *before* resolving workflow transitions and field permissions — a request that
  // changes the tracker is governed by the new tracker's workflow, not the old one's.
  const targetTrackerId = requested.trackerId ?? before.trackerId;

  if (!options.skipTransitionCheck && requested.statusId && requested.statusId !== before.statusId) {
    const transitions = await repositories.workflowRepository.listForTracker(targetTrackerId);
    const allowed = canTransitionTo(
      transitions,
      {
        trackerId: targetTrackerId,
        roleIds: input.actorRoleIds,
        currentStatusId: before.statusId,
        isAuthor: input.isAuthor,
        isAssignee: input.isAssignee,
      },
      requested.statusId,
    );
    if (!allowed) {
      throw new WorkflowTransitionDeniedError(before.statusId, requested.statusId);
    }
  }

  // Field permission rules are keyed by the status the issue will have *after* this update
  // (mirrors Redmine's Issue#safe_attributes=, which assigns status_id before computing
  // workflow_rule_by_attribute — see the doc comment on WorkflowFieldPermission).
  const fieldPermissionQuery = {
    trackerId: targetTrackerId,
    statusId: requested.statusId ?? before.statusId,
    roleIds: input.actorRoleIds,
  };
  // Skipped for cascades with no real acting-user role behind them (rescheduleFollowingIssues)
  // — Redmine's raw model save for these has no equivalent of workflow field permissions.
  const fieldPermissions = options.skipFieldPermissions ? [] : await repositories.workflowFieldPermissionRepository.listForTracker(targetTrackerId);

  // Mirrors Issue#safe_attributes: the attribute block is gated on attributes_editable?
  // and `notes` separately on notes_addable?, so a user with only add_issue_notes can
  // comment without being able to change anything.
  const changes = requested;
  for (const field of readOnlyAttributeNames(fieldPermissions, fieldPermissionQuery)) {
    delete changes[field];
  }
  // Permission-gated attributes, dropped the same silent way Redmine's safe_attributes does.
  if (!input.canSetPrivate) delete changes.isPrivate;
  if (!input.canManageSubtasks) delete changes.parentId;

  // `names -= disabled_core_fields` (Issue#safe_attribute_names): a field an administrator
  // switched off for this tracker isn't settable at all, so it is dropped rather than
  // rejected — keyed on the tracker the update targets, like every other rule here.
  const targetTracker = await repositories.trackerRepository.findById(targetTrackerId);
  if (targetTracker) {
    for (const field of TRACKER_CORE_FIELDS) {
      if (!isCoreFieldDisabled(targetTracker, field)) continue;
      delete changes[field];
      // The assignee is two columns; dropping one without the other would leave a dangling type.
      if (field === "assignedToId") delete changes.assignedToType;
    }
  }

  // Mirrors safe_attribute_names subtracting start_date/due_date, priority_id and done_ratio
  // when the matching parent_issue_* setting derives them — all gated on `!leaf?`, so a
  // childless issue keeps full control of its own values.
  const rollupSettings = resolveGeneralSettings(await repositories.settingsRepository.getAll());
  const touchesDerivable =
    (rollupSettings.parentIssueDates === "derived" && (changes.startDate !== undefined || changes.dueDate !== undefined)) ||
    (rollupSettings.parentIssuePriority === "derived" && changes.priorityId !== undefined) ||
    (rollupSettings.parentIssueDoneRatio === "derived" && changes.doneRatio !== undefined);
  if (touchesDerivable) {
    const siblings = await repositories.issueRepository.listByProject(before.projectId);
    const hasChildren = siblings.some((candidate) => candidate.parentId === before.id);
    if (hasChildren) {
      if (rollupSettings.parentIssueDates === "derived") {
        delete changes.startDate;
        delete changes.dueDate;
      }
      if (rollupSettings.parentIssuePriority === "derived") delete changes.priorityId;
      if (rollupSettings.parentIssueDoneRatio === "derived") delete changes.doneRatio;
    }
  }

  // Resolved up front so the status branch below doesn't re-read the settings table. Note
  // Redmine keeps 'done_ratio' in safe_attributes regardless of this setting — only the views
  // hide the field — so a submitted value is still honoured unless the target status carries
  // a default_done_ratio to override it.
  const { issueDoneRatio } = resolveGeneralSettings(await repositories.settingsRepository.getAll());

  if (changes.statusId && changes.statusId !== before.statusId) {
    const targetStatus = await repositories.issueStatusRepository.findById(changes.statusId);

    // Mirrors Redmine's Issue#validate_issue: `blocked?` — a "blocks" relation pointing at
    // this issue whose blocker isn't closed yet — prevents closing regardless of who's
    // making the change or what workflow transitions allow. Skipped for the close-duplicates
    // cascade, matching Redmine's update_attribute bypassing validations there too.
    if (!options.skipBlockedCheck && targetStatus?.isClosed) {
      const relations = await repositories.issueRelationRepository.listForIssue(input.issueId);
      const blockerIds = relations.filter((r) => r.relationType === "blocks" && r.issueToId === input.issueId).map((r) => r.issueFromId);
      if (blockerIds.length > 0) {
        const blockers = await repositories.issueRepository.findByIds(blockerIds);
        const statuses = await repositories.issueStatusRepository.listAll();
        const statusById = new Map(statuses.map((s) => [s.id, s]));
        const stillBlocked = blockers.some((blocker) => !statusById.get(blocker.statusId)?.isClosed);
        if (stillBlocked) {
          throw new BlockedIssueCloseError();
        }
      }
    }

    // Mirrors Redmine's Issue#update_done_ratio_from_issue_status, which only runs when
    // Setting.issue_done_ratio == 'issue_status' — the same status-derived done_ratio the
    // SCM commit-hook path (sync-changesets.ts) already applies unconditionally. Applied after
    // the read-only stripping above since this is a model-level side effect of the status
    // change itself, not a field the actor is directly setting.
    if (issueDoneRatio === "issue_status" && targetStatus?.defaultDoneRatio != null) {
      changes.doneRatio = targetStatus.defaultDoneRatio;
    }
  }

  // A field key can be present in `changes` with value `undefined` (every REST PATCH field is
  // optional, so the route always sends every key) — that means "not touched by this
  // request," not "clear it," so it must not shadow `before`'s real value in the merge
  // (mirrors diffIssueChanges's own undefined-means-omitted handling above).
  const merged: Record<string, unknown> = { ...before };
  for (const [key, value] of Object.entries(changes)) {
    if (value !== undefined) merged[key] = value;
  }
  for (const field of requiredAttributeNames(fieldPermissions, fieldPermissionQuery)) {
    if (isFieldBlank(merged[field])) {
      throw new WorkflowRequiredFieldError(field);
    }
  }

  // Only the ids this request actually changes are re-checked — an unchanged assignee who
  // has since left the project, or a version that stopped being shared, must not block an
  // edit to some other field (Redmine guards the same validations with `_changed?`).
  const assigneeChanged =
    changes.assignedToId !== undefined &&
    (changes.assignedToId !== before.assignedToId || (changes.assignedToType ?? null) !== before.assignedToType);
  await assertIssueAttributesAssignable(repositories, {
    projectId: before.projectId,
    authorId: before.authorId,
    currentAssignee:
      before.assignedToId && before.assignedToType ? { id: before.assignedToId, type: before.assignedToType } : null,
    candidate: {
      trackerId: changes.trackerId !== undefined && changes.trackerId !== before.trackerId ? changes.trackerId : undefined,
      priorityId: changes.priorityId !== undefined && changes.priorityId !== before.priorityId ? changes.priorityId : undefined,
      assignedTo: assigneeChanged
        ? changes.assignedToId && changes.assignedToType
          ? { id: changes.assignedToId, type: changes.assignedToType }
          : null
        : undefined,
      categoryId: changes.categoryId !== undefined && changes.categoryId !== before.categoryId ? changes.categoryId : undefined,
      fixedVersionId:
        changes.fixedVersionId !== undefined && changes.fixedVersionId !== before.fixedVersionId ? changes.fixedVersionId : undefined,
    },
  });

  // Parent re-assignment is checked here rather than only in the calling action, because
  // `parentId` is a plain field of `IssueUpdate` that any caller can set: a cross-project or
  // cyclic parent corrupts the tree (the column's own FK only guarantees the row exists), and
  // a cycle makes every later walk of the chain loop. Mirrors Redmine's
  // Issue#validate_parent_issue, which lives on the model for the same reason. Visibility of
  // the chosen parent stays with the callers, which alone know the acting user's roles.
  if (changes.parentId !== undefined && changes.parentId !== null && changes.parentId !== before.parentId) {
    const projectIssues = await repositories.issueRepository.listByProject(before.projectId);
    const parent = projectIssues.find((candidate) => candidate.id === changes.parentId);
    if (!parent) {
      // Either no such issue, or one in another project — indistinguishable here on purpose,
      // so the error can't be used to probe for issue ids outside this project.
      const exists = await repositories.issueRepository.findById(changes.parentId);
      throw new InvalidParentIssueError(exists ? "cross_project" : "not_found");
    }
    const parentIdById = new Map(projectIssues.map((candidate) => [candidate.id, candidate.parentId]));
    if (wouldCreateParentCycle(input.issueId, changes.parentId, parentIdById)) {
      throw new InvalidParentIssueError("cycle");
    }
  }

  // Validated before the issue row is touched so an invalid custom value can't leave a
  // half-applied edit behind; the write itself happens after, once the issue is safely
  // stored, so both land in the single journal below.
  const preparedCustomFieldValues =
    customFieldValues && Object.keys(customFieldValues).length > 0
      ? await prepareIssueCustomFieldValues(repositories, targetTrackerId, input.issueId, before.projectId, customFieldValues)
      : null;

  const after = await repositories.issueRepository.update(input.issueId, input.expectedLockVersion, changes);

  const customFieldDetails = preparedCustomFieldValues
    ? await applyIssueCustomFieldValues(repositories, input.issueId, preparedCustomFieldValues)
    : [];

  let persistedNotes = "";
  let persistedNotesPrivate = false;
  const details = [...diffIssueChanges(before, changes), ...customFieldDetails];
  if (details.length > 0 || notes.trim().length > 0) {
    // Mirrors Journal#split_private_notes: a private note carrying attribute changes
    // becomes two journals so the changes stay public, and a blank note is never private.
    const privateNotes = input.canSetNotesPrivate === true && input.privateNotes === true;
    for (const journal of splitPrivateNote({ notes, privateNotes, details })) {
      await repositories.journalRepository.create({
        journalizedType: "Issue",
        journalizedId: input.issueId,
        userId: input.actingUserId,
        notes: journal.notes,
        privateNotes: journal.privateNotes,
        details: journal.details,
      });
      if (journal.notes.trim().length > 0) {
        persistedNotes = journal.notes;
        persistedNotesPrivate = journal.privateNotes;
      }
    }
    // Mirrors Redmine's issue_contributed_to trigger — firing on any recorded change, not
    // just notes, since a plain field edit shows up in the issue's history the same as a
    // comment does.
    await applyAutoWatch(repositories, "issue_contributed_to", "Issue", input.issueId, input.actingUserId);
  }

  if (after.assignedToId && after.assignedToType === "user" && after.assignedToId !== before.assignedToId) {
    await applyAutoWatch(repositories, "issue_assigned_to_me", "Issue", input.issueId, after.assignedToId);
  }

  // Any of these can move a parent's derived dates, priority or done ratio. A re-parent has
  // to refresh the old parent too, which is no longer reachable from this issue.
  const affectsRollup =
    changes.startDate !== undefined ||
    changes.dueDate !== undefined ||
    changes.doneRatio !== undefined ||
    changes.estimatedHours !== undefined ||
    changes.priorityId !== undefined ||
    changes.statusId !== undefined ||
    changes.parentId !== undefined;
  if (affectsRollup) {
    await recalculateParents(repositories, input.issueId, [before.parentId]);
  }

  return { after, appliedChanges: changes, persistedNotes, persistedNotesPrivate };
}
