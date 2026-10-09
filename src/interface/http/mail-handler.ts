import { visibleCustomFieldsFor } from "@/domain/custom-field/visibility";
import { customFieldViewerFor } from "@/interface/http/custom-field-viewer";
import { loadCustomFieldOptionSets } from "@/application/custom-field/option-sets";
import { customFieldOptionRepositories } from "@/interface/http/custom-field-option-repositories";
import { can } from "@/domain/authorization/authorization-service";
import { validateCustomFieldValues } from "@/domain/custom-field/coerce";
import type { CustomField } from "@/domain/custom-field/entity";
import {
  filterMembersVisibleToPrivateIssue,
  filterUserIdsVisibleToPrivateIssue,
  isPrivateIssueVisible,
} from "@/domain/issue/visibility";
import {
  extractIssueReplyRef,
  extractMessageReplyIdPrefix,
  isAutoSubmitted,
  parseEmail,
  plainTextBody,
  projectIdentifierFromSubaddress,
  stripMessageReplyToken,
  type MailAttachment,
  type ParsedEmail,
} from "@/domain/mail/parse-email";
import { cleanupBody } from "@/domain/mail/body-cleanup";
import { issueMailSubject, messageMailSubject } from "@/domain/mail/subject";
import {
  extractIssueKeywords,
  parseAllowOverride,
  parseKeywordBool,
  type IssueKeywordAttribute,
} from "@/domain/mail/keywords";
import { loadSmtpConfigFromEnv } from "@/domain/mailer/smtp-config";
import type { Project } from "@/domain/project/entity";
import { isExcludedAttachmentFilename, resolveMailHandlerSettings } from "@/domain/settings/mail-handler-settings";
import type { MailHandlerSettings } from "@/domain/settings/mail-handler-settings";
import type { Issue } from "@/domain/issue/entity";
import type { IssueUpdate } from "@/domain/issue/repository";
import type { User } from "@/domain/user/entity";
import { createIssue } from "@/application/issues/create-issue";
import { findIssuesByReference } from "@/application/issues/find-issues-by-reference";
import { IssueAttributeNotAssignableError } from "@/application/issues/validate-issue-attributes";
import { updateIssue, WorkflowRequiredFieldError, WorkflowTransitionDeniedError } from "@/application/issues/update-issue";
import { postMessage, InvalidMessageError, LockedTopicError } from "@/application/messages/post-message";
import { uploadAttachment } from "@/application/attachments/upload-attachment";
import { InvalidAttachmentError } from "@/domain/attachment/validate";
import { createUserFromEmail } from "@/application/mail/create-user-from-email";
import { enqueueNotification } from "@/application/jobs/enqueue-notification";
import { drizzleIssueAttributeRepositories } from "@/infrastructure/db/repositories/issue-attribute-repositories";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleBoardRepository } from "@/infrastructure/db/repositories/board-repository";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleIssueCategoryRepository } from "@/infrastructure/db/repositories/issue-category-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueRelationRepository } from "@/infrastructure/db/repositories/issue-relation-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { memberUserIds } from "@/domain/member/entity";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleMessageRepository } from "@/infrastructure/db/repositories/message-repository";
import { DrizzlePasswordResetTokenRepository } from "@/infrastructure/db/repositories/password-reset-token-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleUserPreferencesRepository } from "@/infrastructure/db/repositories/user-preferences-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { DrizzleWorkflowFieldPermissionRepository } from "@/infrastructure/db/repositories/workflow-field-permission-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "./resolve-actor";
import { triggerIssueWebhook } from "./webhook-trigger";

/**
 * next-pm's MailHandler — the port of Redmine's `MailHandler#receive` / `#dispatch`. It lives
 * in the interface layer rather than under application/ because, like every other entry point
 * here, it is the place that runs `can()` and then hands plain flags down to the use cases:
 * every write still goes through `createIssue` / `updateIssue` / `postMessage`, so workflow
 * rules, required fields and attribute assignability are enforced exactly once, in the same
 * code paths the UI and the REST API use.
 *
 * Deliberate deviations from Redmine, all forced by next-pm's own model:
 *
 * - `unknown_user=accept` is not supported. Redmine attributes such a mail to its singleton
 *   anonymous `User` record; next-pm has an anonymous *role* but no anonymous user row, and
 *   `issues.author_id` is a real foreign key. The option is rejected rather than silently
 *   downgraded.
 * - `unknown_user=create` mails a password-reset link instead of Redmine's generated
 *   cleartext password: the notification body is persisted in `jobs.payload`, so putting a
 *   usable password there would be strictly worse than the link it replaces.
 * - replies are routed by the subject token only (`[... #eb0b2d1a]`, `[... msgXXXXXXXX]`).
 *   Redmine also routes by its own `Message-ID`, which next-pm's Mailer port cannot set.
 */

export type UnknownUserMode = "ignore" | "accept" | "create";

export interface MailHandlerIssueDefaults {
  project?: string;
  status?: string;
  tracker?: string;
  category?: string;
  priority?: string;
  assigned_to?: string;
  fixed_version?: string;
  is_private?: string;
}

export interface MailHandlerOptions {
  allowOverride?: string;
  unknownUser?: string;
  defaultGroup?: string;
  noAccountNotice?: boolean;
  noNotification?: boolean;
  noPermissionCheck?: boolean;
  projectFromSubaddress?: string;
  issue?: MailHandlerIssueDefaults;
  /** Origin of the incoming request, used to build the account link mailed to a new user. */
  appOrigin: string;
}

export interface MailHandlerResult {
  status: number;
  body: Record<string, unknown>;
}

const ignored = (reason: string): MailHandlerResult => ({ status: 200, body: { result: "ignored", reason } });

interface HandlerContext {
  email: ParsedEmail;
  sender: User;
  body: string;
  attachments: MailAttachment[];
  attributes: Partial<Record<IssueKeywordAttribute, string>>;
  customFieldKeywords: Record<string, string>;
  options: MailHandlerOptions;
  settings: MailHandlerSettings;
  allowOverride: string[];
}

/** Redmine's `MailHandler.receive` normalization of `allow_override`. */
function resolveAllowOverride(options: MailHandlerOptions): string[] {
  const list = parseAllowOverride(options.allowOverride);
  // "Project needs to be overridable if not specified" — MailHandler.receive.
  if (!options.issue?.project && !list.includes("project")) {
    list.push("project");
  }
  return list;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export async function receiveEmail(raw: string, options: MailHandlerOptions): Promise<MailHandlerResult> {
  const unknownUser = (options.unknownUser ?? "ignore") as UnknownUserMode;
  if (unknownUser === "accept") {
    return { status: 422, body: { error: "unsupported_unknown_user_mode", mode: "accept" } };
  }

  const settings = resolveMailHandlerSettings(await new DrizzleSettingsRepository().getAll());
  const email = parseEmail(raw);

  if (isAutoSubmitted(email)) {
    return ignored("auto_submitted");
  }
  const emissionAddress = loadSmtpConfigFromEnv(process.env)?.from;
  if (emissionAddress && normalizeName(emissionAddress) === email.fromEmail) {
    // Redmine refuses its own emission address outright to avoid a notification loop.
    return ignored("emission_address");
  }
  if (!email.fromEmail) {
    return ignored("missing_sender");
  }

  const userRepository = new DrizzleUserRepository();
  let sender = await userRepository.findByMail(email.fromEmail);
  if (sender && sender.status !== "active") {
    return ignored("inactive_sender");
  }
  if (!sender) {
    if (unknownUser !== "create") {
      // Redmine's default: mail from an unknown sender is dropped, not reported as an error.
      return ignored("unknown_sender");
    }
    sender = await createUserFromEmail(
      {
        userRepository,
        groupRepository: new DrizzleGroupRepository(),
        passwordResetTokenRepository: new DrizzlePasswordResetTokenRepository(),
        jobRepository: new DrizzleJobRepository(),
      },
      {
        mail: email.fromEmail,
        fullname: email.fromName,
        defaultGroupNames: options.defaultGroup ?? null,
        notify: !options.noAccountNotice && !options.noNotification,
        appOrigin: options.appOrigin,
      },
    );
    if (!sender) {
      return ignored("account_creation_failed");
    }
  }

  const cleanedBody = cleanupBody(plainTextBody(email, settings.preferredBodyPart), {
    delimiters: settings.bodyDelimiters,
    enableRegex: settings.enableRegexDelimiters,
  });
  const allowOverride = resolveAllowOverride(options);
  const attachments = email.attachments.filter((attachment) => !isExcludedAttachmentFilename(attachment.filename, settings));

  const issueReplyRef = extractIssueReplyRef(email.subject);
  const messageReplyPrefix = issueReplyRef ? null : extractMessageReplyIdPrefix(email.subject);

  // Custom field keywords are only meaningful on the issue paths; their names depend on the
  // tracker, which isn't known until the target issue/project is resolved, so the body is
  // scanned there and the generic pass here handles the fixed attributes only.
  const base: Omit<HandlerContext, "attributes" | "customFieldKeywords" | "body"> = {
    email,
    sender,
    attachments,
    options,
    settings,
    allowOverride,
  };

  if (issueReplyRef) {
    return handleIssueReply(base, cleanedBody, issueReplyRef);
  }
  if (messageReplyPrefix) {
    return handleMessageReply(base, cleanedBody, messageReplyPrefix);
  }
  return handleNewIssue(base, cleanedBody);
}

/** Resolves the target project the way Redmine's `#target_project` does, in the same order. */
async function resolveTargetProject(
  email: ParsedEmail,
  keywordProject: string | undefined,
  options: MailHandlerOptions,
): Promise<Project | null> {
  const projectRepository = new DrizzleProjectRepository();

  const subaddress = options.projectFromSubaddress;
  if (subaddress) {
    const identifier = projectIdentifierFromSubaddress(email, subaddress);
    if (identifier) {
      const project = await projectRepository.findByIdentifier(identifier);
      if (project) return project;
    }
  }
  if (keywordProject) {
    const project = await projectRepository.findByIdentifier(keywordProject);
    if (project) return project;
  }
  if (options.issue?.project) {
    return projectRepository.findByIdentifier(options.issue.project);
  }
  return null;
}

interface ResolvedKeywordAttributes {
  changes: IssueUpdate;
  customFieldValues: Record<string, string>;
  isPrivate: boolean | null;
}

/**
 * Turns the keyword strings into the ids the use cases expect. A keyword that names nothing in
 * the project is dropped, exactly as Redmine's `issue_attributes_from_keywords` drops a nil id;
 * whether the sender may actually set the attribute is still decided by `updateIssue` /
 * `createIssue` (workflow read-only fields) and `assertIssueAttributesAssignable`.
 */
async function resolveKeywordAttributes(
  project: Project,
  attributes: Partial<Record<IssueKeywordAttribute, string>>,
  customFieldKeywords: Record<string, string>,
  applicableFields: CustomField[],
): Promise<ResolvedKeywordAttributes> {
  const changes: IssueUpdate = {};

  if (attributes.tracker) {
    const trackers = await new DrizzleTrackerRepository().findByIds(project.trackerIds);
    const tracker = trackers.find((candidate) => normalizeName(candidate.name) === normalizeName(attributes.tracker!));
    if (tracker) changes.trackerId = tracker.id;
  }
  if (attributes.status) {
    const statuses = await new DrizzleIssueStatusRepository().listAll();
    const status = statuses.find((candidate) => normalizeName(candidate.name) === normalizeName(attributes.status!));
    if (status) changes.statusId = status.id;
  }
  if (attributes.priority) {
    const priorities = await new DrizzleEnumerationRepository().listByType("IssuePriority");
    const priority = priorities.find((candidate) => normalizeName(candidate.name) === normalizeName(attributes.priority!));
    if (priority) changes.priorityId = priority.id;
  }
  if (attributes.category) {
    const categories = await new DrizzleIssueCategoryRepository().listByProject(project.id);
    const category = categories.find((candidate) => normalizeName(candidate.name) === normalizeName(attributes.category!));
    if (category) changes.categoryId = category.id;
  }
  if (attributes.fixed_version) {
    const versions = await new DrizzleVersionRepository().listSharedWith(project.id);
    const version = versions.find((candidate) => normalizeName(candidate.name) === normalizeName(attributes.fixed_version!));
    if (version) changes.fixedVersionId = version.id;
  }
  if (attributes.assigned_to) {
    const assignee = await findAssignee(project, attributes.assigned_to);
    if (assignee) {
      changes.assignedToId = assignee.id;
      changes.assignedToType = assignee.type;
    }
  }
  if (attributes.start_date) changes.startDate = attributes.start_date;
  if (attributes.due_date) changes.dueDate = attributes.due_date;
  if (attributes.estimated_hours) {
    const hours = Number(attributes.estimated_hours);
    if (Number.isFinite(hours) && hours >= 0) changes.estimatedHours = hours;
  }
  if (attributes.done_ratio) changes.doneRatio = Number(attributes.done_ratio);

  const customFieldValues: Record<string, string> = {};
  for (const [name, value] of Object.entries(customFieldKeywords)) {
    const field = applicableFields.find((candidate) => normalizeName(candidate.name) === normalizeName(name));
    if (field) customFieldValues[field.id] = value;
  }

  return {
    changes,
    customFieldValues,
    isPrivate: attributes.is_private ? parseKeywordBool(attributes.is_private) : null,
  };
}

/** Redmine's `Principal.detect_by_keyword` over the project's assignable principals. */
async function findAssignee(
  project: Project,
  keyword: string,
): Promise<{ id: string; type: "user" | "group" } | null> {
  const normalized = normalizeName(keyword);
  const members = await new DrizzleMemberRepository().listByProject(project.id);

  const groupIds = [...new Set(members.flatMap((member) => (member.groupId ? [member.groupId] : [])))];
  for (const groupId of groupIds) {
    const group = await new DrizzleGroupRepository().findById(groupId);
    if (group && normalizeName(group.name) === normalized) {
      return { id: group.id, type: "group" };
    }
  }

  const userIds = [...new Set(members.flatMap((member) => (member.userId ? [member.userId] : [])))];
  const users = await new DrizzleUserRepository().findByIds(userIds);
  const match = users.find(
    (user) =>
      normalizeName(user.login) === normalized ||
      normalizeName(user.mail) === normalized ||
      normalizeName(`${user.firstname} ${user.lastname}`) === normalized ||
      normalizeName(`${user.lastname} ${user.firstname}`) === normalized,
  );
  return match ? { id: match.id, type: "user" } : null;
}

/** Saves every accepted attachment against the container, skipping the ones the limits reject. */
async function saveAttachments(
  attachments: MailAttachment[],
  containerType: "Issue" | "Message",
  containerId: string,
  authorId: string,
): Promise<number> {
  if (attachments.length === 0) return 0;

  const repositories = {
    attachmentRepository: new DrizzleAttachmentRepository(),
    attachmentStorage: new FsAttachmentStore(),
    settingsRepository: new DrizzleSettingsRepository(),
  };
  let saved = 0;
  for (const attachment of attachments) {
    try {
      await uploadAttachment(repositories, {
        containerType,
        containerId,
        authorId,
        filename: attachment.filename,
        contentType: attachment.contentType,
        data: attachment.content,
      });
      saved += 1;
    } catch (error) {
      // An oversized or unnamed attachment must not cost the sender the issue or the note —
      // Redmine logs and moves on too (Attachment.create simply fails validation).
      if (!(error instanceof InvalidAttachmentError)) throw error;
    }
  }
  return saved;
}

/**
 * Redmine's `#add_watchers`: every To/Cc address that belongs to an active user becomes a
 * watcher, provided the sender holds the matching `add_*_watchers` permission.
 */
async function addRecipientsAsWatchers(
  email: ParsedEmail,
  watchableType: "Issue" | "Message",
  watchableId: string,
): Promise<string[]> {
  const addresses = [...new Set([...email.to, ...email.cc])];
  if (addresses.length === 0) return [];

  const userRepository = new DrizzleUserRepository();
  const watcherRepository = new DrizzleWatcherRepository();
  const added: string[] = [];
  for (const address of addresses) {
    const user = await userRepository.findByMail(address);
    if (!user || user.status !== "active") continue;
    await watcherRepository.watch(watchableType, watchableId, user.id);
    added.push(user.id);
  }
  return added;
}

function issueUpdateRepositories() {
  return {
    ...drizzleIssueAttributeRepositories(),
    issueRepository: new DrizzleIssueRepository(),
    journalRepository: new DrizzleJournalRepository(),
    workflowRepository: new DrizzleWorkflowRepository(),
    workflowFieldPermissionRepository: new DrizzleWorkflowFieldPermissionRepository(),
    issueStatusRepository: new DrizzleIssueStatusRepository(),
    issueRelationRepository: new DrizzleIssueRelationRepository(),
    settingsRepository: new DrizzleSettingsRepository(),
    userPreferencesRepository: new DrizzleUserPreferencesRepository(),
    watcherRepository: new DrizzleWatcherRepository(),
    customFieldRepository: new DrizzleCustomFieldRepository(),
    customValueRepository: new DrizzleCustomValueRepository(),
  };
}

function mapWriteFailure(error: unknown): MailHandlerResult | null {
  if (error instanceof WorkflowRequiredFieldError) return ignored("workflow_required_field");
  if (error instanceof WorkflowTransitionDeniedError) return ignored("workflow_transition_denied");
  // Same "silently ignore, don't bounce" posture the handler takes for mail it can't act on —
  // an unusable attribute is not something the sender can be told about.
  if (error instanceof IssueAttributeNotAssignableError) {
    return { status: 200, body: { result: "ignored", reason: "invalid_issue_attribute", field: error.field } };
  }
  return null;
}

/**
 * Same recipient pool as the issue edit form's action (author + assignees + project members +
 * watchers, with the private-issue rejection applied to the groups that need it) — an issue
 * created or commented by mail must reach exactly the people it would have reached from the UI.
 */
async function notifyIssueRecipients(project: Project, issue: Issue, actingUserId: string, body: string) {
  const assigneeUserIds =
    issue.assignedToType === "group" && issue.assignedToId
      ? await new DrizzleGroupRepository().listUserIds(issue.assignedToId)
      : [issue.assignedToId];

  const members = await new DrizzleMemberRepository().listByProject(project.id);
  const roleRepository = new DrizzleRoleRepository();
  const rolesById = new Map(
    (await roleRepository.findByIds([...new Set(members.flatMap((member) => member.roleIds))])).map((role) => [
      role.id,
      role,
    ]),
  );
  const notifiableMembers = filterMembersVisibleToPrivateIssue(issue, members, rolesById);

  const watcherUserIds = await new DrizzleWatcherRepository().listWatcherUserIds("Issue", issue.id);
  const rolesByUserId = new Map(
    members.flatMap((member) =>
      member.userId === null
        ? []
        : [
            [
              member.userId,
              member.roleIds.flatMap((roleId) => {
                const role = rolesById.get(roleId);
                return role ? [role] : [];
              }),
            ] as const,
          ],
    ),
  );
  const notifiableWatcherUserIds = filterUserIdsVisibleToPrivateIssue(issue, watcherUserIds, rolesByUserId);

  await enqueueNotification(
    { jobRepository: new DrizzleJobRepository() },
    {
      recipientGroups: [[issue.authorId, ...assigneeUserIds], memberUserIds(notifiableMembers), notifiableWatcherUserIds],
      excludeUserId: actingUserId,
      subject: issueMailSubject(project.name, issue.number, issue.subject),
      body,
    },
  );
}

type BaseContext = Omit<HandlerContext, "attributes" | "customFieldKeywords" | "body">;

async function handleNewIssue(base: BaseContext, cleanedBody: string): Promise<MailHandlerResult> {
  // The project keyword has to come out of the body before the project is known, so this pass
  // runs first and the tracker-dependent custom field pass runs once the project is resolved.
  const projectPass = extractIssueKeywords(cleanedBody, { allowOverride: base.allowOverride, customFieldNames: [] });
  const project = await resolveTargetProject(base.email, projectPass.attributes.project, base.options);
  if (!project) {
    return { status: 422, body: { error: "missing_project" } };
  }

  const { actor, roleIds } = await resolveActor(base.sender, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!base.options.noPermissionCheck && !can({ permission: "add_issues", project: projectContext, actor })) {
    return ignored("insufficient_permissions");
  }

  const customFieldRepository = new DrizzleCustomFieldRepository();
  const trackerIdFromKeyword = projectPass.attributes.tracker;
  const defaultTrackerId = project.trackerIds[0];
  if (!defaultTrackerId) {
    return { status: 422, body: { error: "no_tracker_available" } };
  }

  // Scanning custom field names needs a tracker, and the tracker itself can be a keyword, so
  // resolve the tracker from the first pass before listing the fields it applies to.
  const trackers = await new DrizzleTrackerRepository().findByIds(project.trackerIds);
  const keywordTracker = trackerIdFromKeyword
    ? trackers.find((tracker) => normalizeName(tracker.name) === normalizeName(trackerIdFromKeyword))
    : undefined;
  const trackerId = keywordTracker?.id ?? defaultTrackerId;
  const applicableFields = visibleCustomFieldsFor(await customFieldRepository.listForTracker(trackerId), customFieldViewerFor(base.sender, roleIds));

  const keywords = extractIssueKeywords(cleanedBody, {
    allowOverride: base.allowOverride,
    customFieldNames: applicableFields.map((field) => field.name),
  });
  const resolved = await resolveKeywordAttributes(project, keywords.attributes, keywords.customFields, applicableFields);

  const priorities = await new DrizzleEnumerationRepository().listByType("IssuePriority");
  const priority = priorities.find((candidate) => candidate.id === resolved.changes.priorityId)
    ?? priorities.find((candidate) => candidate.isDefault)
    ?? priorities[0];
  if (!priority) {
    return { status: 422, body: { error: "no_priority_available" } };
  }

  // A required custom field with nothing to fill it still blocks creation, exactly as it does
  // in real Redmine (Issue#save! raising RecordInvalid) and in this app's REST API.
  const rawCustomValues = Object.fromEntries(
    applicableFields.map((field) => [field.id, resolved.customFieldValues[field.id] ?? ""]),
  );
  const optionSets = await loadCustomFieldOptionSets(customFieldOptionRepositories(), project.id, applicableFields);
  const { fieldErrors, coerced } = validateCustomFieldValues(applicableFields, rawCustomValues, optionSets);
  if (Object.keys(fieldErrors).length > 0) {
    return ignored("required_custom_field_missing");
  }

  const canSetPrivate =
    can({ permission: "set_issues_private", project: projectContext, actor }) ||
    can({ permission: "set_own_issues_private", project: projectContext, actor });
  const defaultsPrivate = base.options.issue?.is_private === "1";

  const subject = base.email.subject.trim().slice(0, 255);
  let issue;
  try {
    issue = await createIssue(
      {
        ...drizzleIssueAttributeRepositories(),
        issueRepository: new DrizzleIssueRepository(),
        trackerRepository: new DrizzleTrackerRepository(),
        workflowFieldPermissionRepository: new DrizzleWorkflowFieldPermissionRepository(),
        userPreferencesRepository: new DrizzleUserPreferencesRepository(),
        watcherRepository: new DrizzleWatcherRepository(),
        issueStatusRepository: new DrizzleIssueStatusRepository(),
        settingsRepository: new DrizzleSettingsRepository(),
      },
      {
        projectId: project.id,
        trackerId,
        priorityId: priority.id,
        subject: subject.length > 0 ? subject : "(no subject)",
        description: keywords.body,
        authorId: base.sender.id,
        assignedToId: resolved.changes.assignedToId ?? null,
        assignedToType: resolved.changes.assignedToType ?? null,
        parentId: null,
        fixedVersionId: resolved.changes.fixedVersionId ?? null,
        categoryId: resolved.changes.categoryId ?? null,
        isPrivate: resolved.isPrivate ?? defaultsPrivate,
        doneRatio: resolved.changes.doneRatio ?? 0,
        estimatedHours: resolved.changes.estimatedHours ?? null,
        startDate: resolved.changes.startDate ?? null,
        dueDate: resolved.changes.dueDate ?? null,
        actorRoleIds: roleIds,
        canSetPrivate: base.options.noPermissionCheck || canSetPrivate,
        canManageSubtasks: false,
      },
    );
  } catch (error) {
    const mapped = mapWriteFailure(error);
    if (mapped) return mapped;
    throw error;
  }

  const customValueRepository = new DrizzleCustomValueRepository();
  for (const { customFieldId, value } of coerced) {
    await customValueRepository.set(customFieldId, "Issue", issue.id, value);
  }

  if (base.options.noPermissionCheck || can({ permission: "add_issue_watchers", project: projectContext, actor })) {
    await addRecipientsAsWatchers(base.email, "Issue", issue.id);
  }
  const savedAttachments = await saveAttachments(base.attachments, "Issue", issue.id, base.sender.id);

  if (!base.options.noNotification) {
    await notifyIssueRecipients(project, issue, base.sender.id, issue.description);
  }
  await triggerIssueWebhook("issue.created", project, issue);

  return { status: 201, body: { result: "issue_created", issue, attachments: savedAttachments } };
}

async function handleIssueReply(base: BaseContext, cleanedBody: string, issueRef: string): Promise<MailHandlerResult> {
  const issueRepository = new DrizzleIssueRepository();
  const candidates = await findIssuesByReference(issueRepository, issueRef);
  if (candidates.length !== 1) {
    return ignored("no_matching_issue");
  }
  const existing = candidates[0];

  const project = await new DrizzleProjectRepository().findById(existing.projectId);
  if (!project) {
    return ignored("no_matching_issue");
  }

  const { actor, roleIds, userGroupIds } = await resolveActor(base.sender, project.id);
  if (!isPrivateIssueVisible(existing, base.sender.id, userGroupIds, issuesVisibilityRoles(actor))) {
    // Same "don't confirm existence" rule as everywhere else a private issue might be reached.
    return ignored("no_matching_issue");
  }

  const projectContext = toAuthorizationProject(project);
  const isAuthor = existing.authorId === base.sender.id;
  const canEditAny = can({ permission: "edit_issues", project: projectContext, actor });
  const canEditOwn = isAuthor && can({ permission: "edit_own_issues", project: projectContext, actor });
  // A reply adds a note, so it needs add_issue_notes (Redmine's receive_issue_reply goes through
  // notes_addable?). Keyword attributes still need the edit permissions, checked below.
  const canAddNotes = base.options.noPermissionCheck || can({ permission: "add_issue_notes", project: projectContext, actor });
  const canEditAttributes = base.options.noPermissionCheck || canEditAny || canEditOwn;
  if (!canAddNotes) {
    return ignored("insufficient_permissions");
  }

  const applicableFields = visibleCustomFieldsFor(
    await new DrizzleCustomFieldRepository().listForTracker(existing.trackerId),
    customFieldViewerFor(base.sender, roleIds),
  );
  const keywords = extractIssueKeywords(cleanedBody, {
    allowOverride: base.allowOverride,
    customFieldNames: applicableFields.map((field) => field.name),
  });
  // Redmine resets the CLI-supplied issue defaults on a reply ("ignore CLI-supplied defaults
  // for new issues"), so only what the body itself carries can change an existing issue.
  const resolved = await resolveKeywordAttributes(project, keywords.attributes, keywords.customFields, applicableFields);
  // A keyword may only change an attribute if the sender could have changed it from the UI.
  const changes = canEditAttributes ? resolved.changes : {};

  const isAssignee =
    existing.assignedToType === "group"
      ? existing.assignedToId !== null && userGroupIds.includes(existing.assignedToId)
      : existing.assignedToId === base.sender.id;

  let issue;
  try {
    const outcome = await updateIssue(issueUpdateRepositories(), {
      issueId: existing.id,
      expectedLockVersion: existing.lockVersion,
      notes: keywords.body,
      actingUserId: base.sender.id,
      actorRoleIds: roleIds,
      customFieldViewer: customFieldViewerFor(base.sender, roleIds),
      canSetPrivate: false,
      canManageSubtasks: false,
      isAuthor,
      isAssignee,
      canEditAttributes,
      canAddNotes,
      changes,
      customFieldValues: resolved.customFieldValues,
    });
    issue = outcome.issue;
  } catch (error) {
    const mapped = mapWriteFailure(error);
    if (mapped) return mapped;
    throw error;
  }

  if (base.options.noPermissionCheck || can({ permission: "add_issue_watchers", project: projectContext, actor })) {
    await addRecipientsAsWatchers(base.email, "Issue", issue.id);
  }
  const savedAttachments = await saveAttachments(base.attachments, "Issue", issue.id, base.sender.id);

  if (!base.options.noNotification) {
    await notifyIssueRecipients(
      project,
      issue,
      base.sender.id,
      keywords.body.length > 0 ? keywords.body : "チケットが更新されました。",
    );
  }

  await triggerIssueWebhook("issue.updated", project, issue);

  return { status: 201, body: { result: "note_added", issue, attachments: savedAttachments } };
}

async function handleMessageReply(base: BaseContext, cleanedBody: string, idPrefix: string): Promise<MailHandlerResult> {
  const messageRepository = new DrizzleMessageRepository();
  const candidates = await messageRepository.findByIdPrefix(idPrefix);
  if (candidates.length !== 1) {
    return ignored("no_matching_message");
  }
  const topic = candidates[0];

  const board = await new DrizzleBoardRepository().findById(topic.boardId);
  const project = board ? await new DrizzleProjectRepository().findById(board.projectId) : null;
  if (!board || !project) {
    return ignored("no_matching_message");
  }

  const { actor } = await resolveActor(base.sender, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!base.options.noPermissionCheck && !can({ permission: "add_messages", project: projectContext, actor })) {
    return ignored("insufficient_permissions");
  }

  const subject = stripMessageReplyToken(base.email.subject).slice(0, 255);
  let reply;
  try {
    reply = await postMessage(
      { messageRepository },
      {
        boardId: board.id,
        parentId: topic.parentId ?? topic.id,
        authorId: base.sender.id,
        subject: subject.length > 0 ? subject : "(no subject)",
        content: cleanedBody.length > 0 ? cleanedBody : "(no content)",
      },
    );
  } catch (error) {
    if (error instanceof LockedTopicError) return ignored("locked_topic");
    if (error instanceof InvalidMessageError) return ignored("invalid_message");
    throw error;
  }

  const savedAttachments = await saveAttachments(base.attachments, "Message", reply.id, base.sender.id);

  if (!base.options.noNotification) {
    const topicId = topic.parentId ?? topic.id;
    const watcherUserIds = await new DrizzleWatcherRepository().listWatcherUserIds("Message", topicId);
    const members = await new DrizzleMemberRepository().listByProject(project.id);
    await enqueueNotification(
      { jobRepository: new DrizzleJobRepository() },
      {
        recipientGroups: [memberUserIds(members), watcherUserIds],
        excludeUserId: base.sender.id,
        subject: messageMailSubject(project.name, topicId, reply.subject),
        body: reply.content,
      },
    );
  }

  return { status: 201, body: { result: "message_posted", message: reply, attachments: savedAttachments } };
}
