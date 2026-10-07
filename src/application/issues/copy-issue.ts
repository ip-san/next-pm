import type { AttachmentRepository, AttachmentStorage } from "@/domain/attachment/repository";
import {
  actorIssuesVisibilityRoles,
  can,
  projectAuthorizationContext,
  type AuthorizationActor,
} from "@/domain/authorization/authorization-service";
import type { CustomFieldRepository } from "@/domain/custom-field/repository";
import type { CustomValueRepository } from "@/domain/custom-value/repository";
import type { Issue } from "@/domain/issue/entity";
import { collectSelfAndDescendantIds } from "@/domain/issue/parent";
import { resolveProjectChange } from "@/domain/issue/project-change";
import type { IssueRepository } from "@/domain/issue/repository";
import type { IssueStatusRepository } from "@/domain/issue-status/repository";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import type { IssueCategoryRepository } from "@/domain/issue-category/repository";
import type { IssueRelationRepository } from "@/domain/issue-relation/repository";
import type { ProjectRepository } from "@/domain/project/repository";
import type { SettingsRepository } from "@/domain/settings/repository";
import type { TrackerRepository } from "@/domain/tracker/repository";
import type { UserPreferencesRepository } from "@/domain/user-preferences/repository";
import type { VersionRepository } from "@/domain/version/repository";
import type { WatcherRepository } from "@/domain/watcher/repository";
import type { WorkflowFieldPermissionRepository } from "@/domain/workflow/repository";
import { createIssueRelation } from "./create-issue-relation";
import { createIssue } from "./create-issue";
import { setIssueCustomFieldValues } from "./set-custom-field-values";
import { isAssigneeAssignable, type IssueAttributeRepositories } from "./validate-issue-attributes";

export class CopyIssueNotPermittedError extends Error {
  constructor(public readonly side: "source" | "target") {
    super(
      side === "source"
        ? "The acting user may not copy this issue."
        : "The acting user may not add issues to the target project.",
    );
    this.name = "CopyIssueNotPermittedError";
  }
}

export type CopyIssueRepositories = IssueAttributeRepositories & {
  issueRepository: IssueRepository;
  projectRepository: ProjectRepository;
  trackerRepository: TrackerRepository;
  issueCategoryRepository: IssueCategoryRepository;
  versionRepository: VersionRepository;
  issueRelationRepository: IssueRelationRepository;
  customFieldRepository: CustomFieldRepository;
  customValueRepository: CustomValueRepository;
  attachmentRepository: AttachmentRepository;
  attachmentStorage: AttachmentStorage;
  workflowFieldPermissionRepository: WorkflowFieldPermissionRepository;
  userPreferencesRepository: UserPreferencesRepository;
  watcherRepository: WatcherRepository;
  settingsRepository: SettingsRepository;
  issueStatusRepository: IssueStatusRepository;
};

export interface CopyIssueInput {
  sourceIssueId: string;
  targetProjectId: string;
  /** Explicit tracker for the copy; otherwise Redmine's keep-or-fall-back rule applies. */
  targetTrackerId?: string;
  actingUserId: string;
  /** The acting user's resolved roles on the source project, and on the target. */
  sourceActor: AuthorizationActor;
  targetActor: AuthorizationActor;
  actorGroupIds?: string[];
  actorRoleIdsOnTarget: string[];
  copyAttachments: boolean;
  copySubtasks: boolean;
  /** Caller passes `add_issue_watchers` on the target project, as Redmine's form does. */
  copyWatchers: boolean;
  canSetPrivate: boolean;
  canManageSubtasks: boolean;
}

export interface CopyIssueResult {
  issue: Issue;
  /** Source issue id -> copy id, root first. */
  copiedIssueIds: Map<string, string>;
}

/**
 * Port of Redmine's `Issue#copy_from` plus its `after_create_from_copy` callback, driven
 * through `createIssue` so the copy goes through the same workflow required-field checks,
 * attribute validation and auto-watch rules as any other new issue — which is how Redmine
 * does it too (its copy *is* the new-issue form, prefilled from `copy_from`).
 */
export async function copyIssue(repositories: CopyIssueRepositories, input: CopyIssueInput): Promise<CopyIssueResult> {
  const source = await repositories.issueRepository.findById(input.sourceIssueId);
  if (!source) {
    throw new Error(`Issue ${input.sourceIssueId} not found`);
  }

  const sourceProject = await repositories.projectRepository.findById(source.projectId);
  if (!sourceProject) {
    throw new Error(`Project ${source.projectId} not found`);
  }
  if (!can({ permission: "copy_issues", project: projectAuthorizationContext(sourceProject), actor: input.sourceActor })) {
    throw new CopyIssueNotPermittedError("source");
  }
  const visibilityRoles = actorIssuesVisibilityRoles(input.sourceActor);
  if (!isPrivateIssueVisible(source, input.actingUserId, input.actorGroupIds ?? [], visibilityRoles)) {
    throw new CopyIssueNotPermittedError("source");
  }

  const targetProject = await repositories.projectRepository.findById(input.targetProjectId);
  if (!targetProject) {
    throw new Error(`Project ${input.targetProjectId} not found`);
  }
  if (!can({ permission: "add_issues", project: projectAuthorizationContext(targetProject), actor: input.targetActor })) {
    throw new CopyIssueNotPermittedError("target");
  }

  const [targetCategories, targetVersions, sourceCategories] = await Promise.all([
    repositories.issueCategoryRepository.listByProject(input.targetProjectId),
    repositories.versionRepository.listSharedWith(input.targetProjectId),
    repositories.issueCategoryRepository.listByProject(source.projectId),
  ]);
  const targetCategoryIdByName = new Map(targetCategories.map((category) => [category.name, category.id]));
  const targetSharedVersionIds = new Set(targetVersions.map((version) => version.id));
  const openVersionIds = new Set(targetVersions.filter((version) => version.status === "open").map((version) => version.id));
  const categoryNameById = new Map(sourceCategories.map((category) => [category.id, category.name]));

  const copiedIssueIds = new Map<string, string>();
  const copy = await copyOne(repositories, input, source, {
    targetProject,
    targetCategoryIdByName,
    targetSharedVersionIds,
    categoryNameById,
    // Redmine's copy form seeds the new issue's parent from the source's, which is a
    // safe_attribute gated on manage_subtasks — and next-pm requires a parent to share the
    // issue's project, so a cross-project copy drops it either way.
    parentId: input.canManageSubtasks && source.projectId === input.targetProjectId ? source.parentId : null,
    requireOpenVersion: false,
    explicitTrackerId: input.targetTrackerId,
  });
  copiedIssueIds.set(source.id, copy.id);

  // Mirrors after_create_from_copy: the copied_to link is only created for a same-project
  // copy, or when cross-project relations are allowed. A failure here is logged and ignored
  // in Redmine rather than failing the copy, so it is swallowed the same way.
  try {
    await createIssueRelation(repositories, { issueFromId: source.id, issueToId: copy.id, relationType: "copied_to", delay: null });
  } catch {
    // the copy itself stands
  }

  if (input.copySubtasks) {
    await copySubtaskTree(repositories, input, source, copy, copiedIssueIds, {
      targetProject,
      targetCategoryIdByName,
      targetSharedVersionIds,
      openVersionIds,
      categoryNameById,
      visibilityRoles,
    });
  }

  return { issue: copy, copiedIssueIds };
}

interface CopyContext {
  targetProject: { id: string; trackerIds: string[] };
  targetCategoryIdByName: ReadonlyMap<string, string>;
  targetSharedVersionIds: ReadonlySet<string>;
  categoryNameById: ReadonlyMap<string, string>;
  parentId: string | null;
  requireOpenVersion: boolean;
  openVersionIds?: ReadonlySet<string>;
  explicitTrackerId?: string;
}

async function copyOne(
  repositories: CopyIssueRepositories,
  input: CopyIssueInput,
  source: Issue,
  context: CopyContext,
): Promise<Issue> {
  const resolved = resolveProjectChange({
    issue: source,
    targetTrackerIds: context.targetProject.trackerIds,
    targetCategoryIdByName: context.targetCategoryIdByName,
    currentCategoryName: source.categoryId ? (context.categoryNameById.get(source.categoryId) ?? null) : null,
    targetSharedVersionIds: context.targetSharedVersionIds,
    parentMovesToo: false,
    keepTracker: false,
  });
  const trackerId =
    context.explicitTrackerId !== undefined && context.targetProject.trackerIds.includes(context.explicitTrackerId)
      ? context.explicitTrackerId
      : resolved.trackerId;

  // Subtask copies additionally drop a version that is no longer open, matching
  // after_create_from_copy's `unless child.fixed_version.status == 'open'`.
  const fixedVersionId =
    resolved.fixedVersionId && (!context.requireOpenVersion || context.openVersionIds?.has(resolved.fixedVersionId))
      ? resolved.fixedVersionId
      : null;

  // "Clear the assignee if not available in the new project for new issues (eg. copy)" —
  // a copy is a new record, so unlike a move it drops an assignee it may not use.
  let assignedToId = source.assignedToId;
  let assignedToType = source.assignedToType;
  if (assignedToId && assignedToType) {
    const assignable = await isAssigneeAssignable(repositories, {
      projectId: context.targetProject.id,
      authorId: input.actingUserId,
      currentAssignee: null,
      assignee: { id: assignedToId, type: assignedToType },
    });
    if (!assignable) {
      assignedToId = null;
      assignedToType = null;
    }
  }

  const copy = await createIssue(repositories, {
    projectId: context.targetProject.id,
    trackerId,
    priorityId: source.priorityId,
    subject: source.subject,
    description: source.description,
    // copy_from excludes author along with id/timestamps/status: `self.author = User.current`.
    authorId: input.actingUserId,
    assignedToId,
    assignedToType,
    parentId: context.parentId,
    fixedVersionId,
    categoryId: resolved.categoryId,
    isPrivate: source.isPrivate,
    doneRatio: source.doneRatio,
    estimatedHours: source.estimatedHours,
    startDate: source.startDate,
    dueDate: source.dueDate,
    actorRoleIds: input.actorRoleIdsOnTarget,
    canSetPrivate: input.canSetPrivate,
    // The hierarchy comes from the source, not from user input; the root copy's parent is
    // already gated on manage_subtasks by the caller above.
    canManageSubtasks: true,
  });

  await copyCustomFieldValues(repositories, source, copy);
  if (input.copyAttachments) {
    await copyAttachments(repositories, source, copy, input.actingUserId);
  }
  if (input.copyWatchers) {
    await copyWatchers(repositories, source, copy);
  }

  return copy;
}

/** `copy_from` carries custom_field_values over; values whose field the target tracker doesn't enable are dropped. */
async function copyCustomFieldValues(repositories: CopyIssueRepositories, source: Issue, copy: Issue): Promise<void> {
  const values = await repositories.customValueRepository.listForCustomized("Issue", source.id);
  const raw = Object.fromEntries(values.flatMap((value) => (value.value === null ? [] : [[value.customFieldId, value.value]])));
  if (Object.keys(raw).length === 0) return;
  try {
    await setIssueCustomFieldValues(repositories, copy.trackerId, copy.id, raw);
  } catch {
    // A value the target tracker's fields reject (e.g. a list option that no longer exists)
    // must not sink the copy — Redmine drops unusable custom values the same way.
  }
}

/**
 * `attachment.copy(:container => self)`. The bytes are written again under a fresh key
 * because `attachments.storage_key` is UNIQUE here — Redmine instead shares one file between
 * copies and reference-counts it on delete, which would make issue deletion unable to remove
 * any file without checking every other row first.
 */
async function copyAttachments(
  repositories: CopyIssueRepositories,
  source: Issue,
  copy: Issue,
  actingUserId: string,
): Promise<void> {
  const attachments = await repositories.attachmentRepository.listByContainer("Issue", source.id);
  for (const attachment of attachments) {
    try {
      const data = await repositories.attachmentStorage.read(attachment.storageKey);
      const storageKey = await repositories.attachmentStorage.save(data);
      await repositories.attachmentRepository.create({
        containerType: "Issue",
        containerId: copy.id,
        authorId: actingUserId,
        filename: attachment.filename,
        storageKey,
        contentType: attachment.contentType,
        fileSize: attachment.fileSize,
        digest: attachment.digest,
        description: attachment.description,
      });
    } catch {
      continue; // a missing source file shouldn't fail the copy
    }
  }
}

/** `self.watcher_user_ids = issue.visible_watcher_users.select { active }`. */
async function copyWatchers(repositories: CopyIssueRepositories, source: Issue, copy: Issue): Promise<void> {
  const watcherUserIds = await repositories.watcherRepository.listWatcherUserIds("Issue", source.id);
  const users = await repositories.userRepository.findByIds(watcherUserIds);
  for (const user of users) {
    if (user.status !== "active") continue;
    await repositories.watcherRepository.watch("Issue", copy.id, user.id);
  }
}

/**
 * Mirrors after_create_from_copy's descendant loop: walk the source's descendants in tree
 * order, skip ones whose parent wasn't copied, skip ones the actor can't see (Redmine: "Do
 * not copy subtasks that are not visible to avoid potential disclosure of private data"),
 * and re-point each copy's parent at the copy of its parent.
 */
async function copySubtaskTree(
  repositories: CopyIssueRepositories,
  input: CopyIssueInput,
  source: Issue,
  rootCopy: Issue,
  copiedIssueIds: Map<string, string>,
  context: Omit<CopyContext, "parentId" | "requireOpenVersion" | "explicitTrackerId"> & {
    openVersionIds: ReadonlySet<string>;
    visibilityRoles: { issuesVisibility: "all" | "default" | "own" }[];
  },
): Promise<void> {
  const projectIssues = await repositories.issueRepository.listByProject(source.projectId);
  const descendantIds = collectSelfAndDescendantIds(
    source.id,
    new Map(projectIssues.map((candidate) => [candidate.id, candidate.parentId])),
  ).filter((id) => id !== source.id);
  const byId = new Map(projectIssues.map((candidate) => [candidate.id, candidate]));

  for (const descendantId of descendantIds) {
    const child = byId.get(descendantId);
    if (!child || child.id === rootCopy.id) continue;
    const copiedParentId = child.parentId ? copiedIssueIds.get(child.parentId) : undefined;
    if (!copiedParentId) continue;
    if (!isPrivateIssueVisible(child, input.actingUserId, input.actorGroupIds ?? [], context.visibilityRoles)) continue;

    try {
      const childCopy = await copyOne(repositories, input, child, {
        targetProject: context.targetProject,
        targetCategoryIdByName: context.targetCategoryIdByName,
        targetSharedVersionIds: context.targetSharedVersionIds,
        categoryNameById: context.categoryNameById,
        parentId: copiedParentId,
        requireOpenVersion: true,
        openVersionIds: context.openVersionIds,
      });
      copiedIssueIds.set(child.id, childCopy.id);
    } catch {
      continue; // Redmine logs the failure and carries on with the rest of the tree
    }
  }
}
