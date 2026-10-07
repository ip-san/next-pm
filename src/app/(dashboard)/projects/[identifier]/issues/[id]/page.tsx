import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { memberUserIds } from "@/domain/member/entity";
import { canEditTimeEntry } from "@/domain/time-entry/visibility";
import { listAssignableTimeEntryUsers } from "@/application/time-entries/assignable-users";
import { otherIssueId, relationLabelFor } from "@/application/issues/create-issue-relation";
import { resolveGeneralSettings } from "@/domain/settings/general-settings";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleIssueCategoryRepository } from "@/infrastructure/db/repositories/issue-category-repository";
import { DrizzleIssueRelationRepository } from "@/infrastructure/db/repositories/issue-relation-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleReactionRepository } from "@/infrastructure/db/repositories/reaction-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { DrizzleWorkflowFieldPermissionRepository } from "@/infrastructure/db/repositories/workflow-field-permission-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import {
  issuesVisibilityRoles,
  listProjectsWithPermission,
  resolveActor,
  toAuthorizationProject,
  visibleIssueFilter,
} from "@/interface/http/resolve-actor";
import { filterAccessibleTimeEntries } from "@/interface/http/time-entry-access";
import { AttachmentList } from "../../../attachment-list";
import { DeleteTimeEntryButton } from "../../time-entries/delete-time-entry-button";
import { AttachmentUploadForm } from "./attachment-upload-form";
import { DeleteIssueRelationButton } from "./delete-issue-relation-button";
import { IssueEditForm } from "./issue-edit-form";
import { CopyIssueForm } from "./copy-issue-form";
import { IssueRelationForm } from "./issue-relation-form";
import { MoveIssueForm } from "./move-issue-form";
import { LogTimeForm } from "./log-time-form";
import { ReactionButton } from "./reaction-button";
import { WatcherManager } from "./watcher-manager";
import { WatchToggleForm } from "./watch-toggle-form";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ identifier: string; id: string }>;
}) {
  const { identifier, id } = await params;

  const [issue, statuses] = await Promise.all([
    new DrizzleIssueRepository().findById(id),
    new DrizzleIssueStatusRepository().listAll(),
  ]);
  if (!issue) {
    notFound();
  }

  const [project, tracker, journals, user] = await Promise.all([
    new DrizzleProjectRepository().findByIdentifier(identifier),
    new DrizzleTrackerRepository().findById(issue.trackerId),
    new DrizzleJournalRepository().listForIssue(id),
    currentUserFromCookies(),
  ]);
  if (!project) {
    notFound();
  }

  const reactions = await new DrizzleReactionRepository().listForReactables(
    "Journal",
    journals.map((journal) => journal.id),
  );
  const reactionsByJournalId = new Map<string, { count: number; reacted: boolean }>();
  for (const reaction of reactions) {
    const entry = reactionsByJournalId.get(reaction.reactableId) ?? { count: 0, reacted: false };
    entry.count += 1;
    if (reaction.userId === user?.id) entry.reacted = true;
    reactionsByJournalId.set(reaction.reactableId, entry);
  }

  const { actor, roleIds, userGroupIds } = await resolveActor(user, project.id);
  if (
    !can({ permission: "view_issues", project: toAuthorizationProject(project), actor }) ||
    !isPrivateIssueVisible(issue, user?.id ?? null, userGroupIds, issuesVisibilityRoles(actor))
  ) {
    notFound();
  }

  const [customValues, timeEntries, activities, attachments, isWatching, versions, trackers, priorities, categories, settings] =
    await Promise.all([
      new DrizzleCustomValueRepository().listForCustomized("Issue", issue.id),
      new DrizzleTimeEntryRepository().listForIssue(issue.id),
      new DrizzleEnumerationRepository().listByType("TimeEntryActivity"),
      new DrizzleAttachmentRepository().listByContainer("Issue", issue.id),
      user ? new DrizzleWatcherRepository().isWatching("Issue", issue.id, user.id) : Promise.resolve(false),
      new DrizzleVersionRepository().listSharedWith(project.id),
      new DrizzleTrackerRepository().findByIds(project.trackerIds),
      new DrizzleEnumerationRepository().listByType("IssuePriority"),
      new DrizzleIssueCategoryRepository().listByProject(project.id),
      new DrizzleSettingsRepository().getAll(),
    ]);

  // The edit form can switch the tracker, and workflow transitions, field permissions and
  // applicable custom fields are all keyed on it — so every tracker in the project is loaded
  // up front rather than round-tripping to the server on each change (Redmine reloads the
  // whole form instead). The issue's own tracker is included even if the project dropped it,
  // so an existing issue's rules stay resolvable.
  const relevantTrackerIds = [...new Set([issue.trackerId, ...project.trackerIds])];
  const [transitionsByTracker, fieldPermissionsByTracker, customFieldsByTracker] = await Promise.all([
    Promise.all(relevantTrackerIds.map((trackerId) => new DrizzleWorkflowRepository().listForTracker(trackerId))),
    Promise.all(
      relevantTrackerIds.map((trackerId) => new DrizzleWorkflowFieldPermissionRepository().listForTracker(trackerId)),
    ),
    Promise.all(relevantTrackerIds.map((trackerId) => new DrizzleCustomFieldRepository().listForTracker(trackerId))),
  ]);
  const transitions = transitionsByTracker.flat();
  const fieldPermissions = fieldPermissionsByTracker.flat();
  const allCustomFields = [...new Map(customFieldsByTracker.flat().map((field) => [field.id, field])).values()].sort(
    (a, b) => a.position - b.position,
  );
  const customFields = allCustomFields.filter((field) => field.trackerIds.includes(issue.trackerId));
  const canLogTime = can({ permission: "log_time", project: toAuthorizationProject(project), actor });
  // Spent time is its own permission in Redmine, and a role with time_entries_visibility
  // == "own" only ever sees its own rows — being able to see the issue is not enough.
  const visibleTimeEntries = filterAccessibleTimeEntries(timeEntries, {
    userId: user?.id ?? null,
    actor,
    userGroupIds,
    projectContext: toAuthorizationProject(project),
    issueById: new Map([[issue.id, issue]]),
  });
  const canEditTimeEntries = can({ permission: "edit_time_entries", project: toAuthorizationProject(project), actor });
  const canEditOwnTimeEntries = can({ permission: "edit_own_time_entries", project: toAuthorizationProject(project), actor });
  const timeEntryCustomFields = canLogTime
    ? await new DrizzleCustomFieldRepository().listForCustomizedType("TimeEntry")
    : [];
  const timeEntryAssignableUsers =
    canLogTime && user && can({ permission: "log_time_for_other_users", project: toAuthorizationProject(project), actor })
      ? (
          await listAssignableTimeEntryUsers(
            {
              memberRepository: new DrizzleMemberRepository(),
              roleRepository: new DrizzleRoleRepository(),
              userRepository: new DrizzleUserRepository(),
            },
            project.id,
            user,
          )
        ).map((candidate) => ({ id: candidate.id, name: `${candidate.lastname} ${candidate.firstname}` }))
      : [];
  const canEditIssues = can({ permission: "edit_issues", project: toAuthorizationProject(project), actor });
  const canEditOwnIssues = can({ permission: "edit_own_issues", project: toAuthorizationProject(project), actor });
  const canAttachFiles = canEditIssues || (canEditOwnIssues && issue.authorId === user?.id);
  const canManageRelations = can({ permission: "manage_issue_relations", project: toAuthorizationProject(project), actor });
  const canDeleteIssues = can({ permission: "delete_issues", project: toAuthorizationProject(project), actor });
  const canCopyIssues = can({ permission: "copy_issues", project: toAuthorizationProject(project), actor });
  const canAddNotes = can({ permission: "add_issue_notes", project: toAuthorizationProject(project), actor });
  const canAddWatchers = can({ permission: "add_issue_watchers", project: toAuthorizationProject(project), actor });
  const canDeleteWatchers = can({ permission: "delete_issue_watchers", project: toAuthorizationProject(project), actor });

  const [watcherUserIds, members] = await Promise.all([
    new DrizzleWatcherRepository().listWatcherUserIds("Issue", issue.id),
    new DrizzleMemberRepository().listByProject(project.id),
  ]);
  const projectMemberUserIds = memberUserIds(members);
  const relevantUsers = await new DrizzleUserRepository().findByIds([...new Set([...watcherUserIds, ...projectMemberUserIds])]);
  const userLabelById = new Map(relevantUsers.map((u) => [u.id, `${u.lastname} ${u.firstname}`]));
  const watcherList = watcherUserIds.map((id) => ({ id, label: userLabelById.get(id) ?? id }));
  const watcherCandidates = projectMemberUserIds
    .filter((userId) => !watcherUserIds.includes(userId))
    .map((id) => ({ id, label: userLabelById.get(id) ?? id }));

  const issueRepository = new DrizzleIssueRepository();
  const [parentIssue, projectIssues, relations] = await Promise.all([
    issue.parentId ? issueRepository.findById(issue.parentId) : Promise.resolve(null),
    issueRepository.listByProject(issue.projectId),
    new DrizzleIssueRelationRepository().listForIssue(issue.id),
  ]);
  const isVisibleToActor = visibleIssueFilter(user?.id ?? null, actor, userGroupIds);

  const visibleParentIssue = parentIssue && isVisibleToActor(parentIssue) ? parentIssue : null;
  const childIssues = projectIssues.filter((candidate) => candidate.parentId === issue.id && isVisibleToActor(candidate));
  const relatedIssues = (
    await Promise.all(relations.map(async (relation) => ({ relation, issue: await issueRepository.findById(otherIssueId(relation, issue.id)) })))
  ).filter(({ issue: other }) => other && isVisibleToActor(other));
  const totalHours = visibleTimeEntries.reduce((sum, entry) => sum + entry.hours, 0);
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const customValueByFieldId = new Map(customValues.map((cv) => [cv.customFieldId, cv.value]));
  const customFieldNameById = new Map(allCustomFields.map((field) => [field.id, field.name]));

  // Group assignment counts as being the assignee for workflow purposes, exactly as the
  // update action resolves it — keying the form off `assignedToId === user.id` alone would
  // offer fewer transitions than the server would actually accept.
  const isAuthor = issue.authorId === user?.id;
  const isAssignee =
    issue.assignedToType === "group"
      ? issue.assignedToId !== null && userGroupIds.includes(issue.assignedToId)
      : issue.assignedToId !== null && issue.assignedToId === user?.id;
  const canEditThisIssue = canEditIssues || (canEditOwnIssues && isAuthor);
  const assignableGroupIds = new Set(members.flatMap((member) => (member.groupId ? [member.groupId] : [])));
  const assignableGroups = canEditThisIssue
    ? (await new DrizzleGroupRepository().listAll()).filter((group) => assignableGroupIds.has(group.id))
    : [];
  // Mirrors Issue#assignable_users: only project members are offerable. The stored assignee
  // may have left since, so their name is resolved separately for the label the form keeps
  // in the dropdown — the update action skips re-validating an unchanged assignee.
  const assignableUsers = relevantUsers.filter((candidate) => projectMemberUserIds.includes(candidate.id));
  // Mirrors Issue.allowed_target_projects: only projects the viewer can add issues to, and
  // only ones with a tracker — listing every project would leak private project names.
  const moveTargets =
    canEditThisIssue || canCopyIssues ? await listProjectsWithPermission(user, "add_issues", { requireTrackers: true }) : [];
  const moveTargetTrackers = Object.fromEntries(
    await Promise.all(
      moveTargets.map(async (candidate) => [candidate.id, await new DrizzleTrackerRepository().findByIds(candidate.trackerIds)] as const),
    ),
  );
  const assigneeUser =
    issue.assignedToId && issue.assignedToType === "user"
      ? (userLabelById.get(issue.assignedToId) ?? (await new DrizzleUserRepository().findById(issue.assignedToId)))
      : null;
  const currentAssigneeLabel = !issue.assignedToId
    ? "(未割当)"
    : issue.assignedToType === "group"
      ? `${assignableGroups.find((group) => group.id === issue.assignedToId)?.name ?? issue.assignedToId}（グループ）`
      : typeof assigneeUser === "string"
        ? assigneeUser
        : assigneeUser
          ? `${assigneeUser.lastname} ${assigneeUser.firstname}`
          : issue.assignedToId;

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{tracker?.name}</p>
          {visibleParentIssue ? (
            <p className="text-xs text-gray-500">
              親チケット:{" "}
              <Link href={`/projects/${identifier}/issues/${visibleParentIssue.id}`} className="underline">
                {visibleParentIssue.subject}
              </Link>
            </p>
          ) : null}
          <h1 className="text-xl font-semibold">{issue.subject}</h1>
          <p className="text-sm text-gray-600">
            ステータス: {statusById.get(issue.statusId)?.name ?? "?"} / 進捗: {issue.doneRatio}%
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user ? <WatchToggleForm issueId={issue.id} projectIdentifier={identifier} isWatching={isWatching} /> : null}
          {canDeleteIssues ? (
            <Link href={`/projects/${identifier}/issues/${issue.id}/destroy`} className="text-sm text-red-700 underline">
              削除
            </Link>
          ) : null}
        </div>
      </div>

      <p className="whitespace-pre-wrap text-sm">{issue.description}</p>

      {customFields.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h2 className="font-medium">カスタムフィールド</h2>
          <dl className="text-sm flex flex-col gap-1">
            {customFields.map((field) => (
              <div key={field.id}>
                <dt className="inline font-medium">{field.name}: </dt>
                <dd className="inline">{customValueByFieldId.get(field.id) ?? "(未設定)"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">履歴</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {journals.map((journal) => {
            const reaction = reactionsByJournalId.get(journal.id) ?? { count: 0, reacted: false };
            return (
              <li key={journal.id} className="border rounded p-2 flex flex-col gap-1">
                <p className="text-gray-500 text-xs">{journal.createdAt.toISOString()}</p>
                {journal.notes ? <p>{journal.notes}</p> : null}
                {journal.details.map((detail, index) => (
                  <p key={index} className="text-xs text-gray-600">
                    {detail.property === "cf" ? (customFieldNameById.get(detail.fieldName) ?? detail.fieldName) : detail.fieldName}:{" "}
                    {detail.fieldName === "description" ? (
                      // Mirrors Redmine's details_to_strings, which reports a description edit
                      // as "updated" rather than dumping both revisions into the history list.
                      <>更新</>
                    ) : (
                      <>
                        {detail.oldValue ?? "(なし)"} → {detail.newValue ?? "(なし)"}
                      </>
                    )}
                  </p>
                ))}
                {user ? (
                  <ReactionButton journalId={journal.id} count={reaction.count} reacted={reaction.reacted} />
                ) : reaction.count > 0 ? (
                  <span className="text-xs rounded-full border px-2 py-0.5 self-start">👍 {reaction.count}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {canEditThisIssue && moveTargets.some((candidate) => candidate.id !== project.id) ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">別プロジェクトへ移動</h2>
          <MoveIssueForm
            issueId={issue.id}
            currentProjectId={project.id}
            targets={moveTargets}
            trackersByProjectId={moveTargetTrackers}
          />
        </section>
      ) : null}

      {canCopyIssues && moveTargets.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">チケットのコピー</h2>
          <CopyIssueForm
            issueId={issue.id}
            currentProjectId={project.id}
            hasSubtasks={childIssues.length > 0}
            hasAttachments={attachments.length > 0}
            canAddWatchers={canAddWatchers}
            targets={moveTargets}
            trackersByProjectId={moveTargetTrackers}
          />
        </section>
      ) : null}

      {canEditThisIssue || canAddNotes ? (
        <section>
          <h2 className="font-medium mb-2">{canEditThisIssue ? "チケットの編集" : "コメントの追加"}</h2>
          <IssueEditForm
            issue={issue}
            parentIssueLabel={visibleParentIssue ? `#${visibleParentIssue.id.slice(0, 8)} ${visibleParentIssue.subject}` : null}
            projectIdentifier={identifier}
            trackers={trackers}
            statuses={statuses}
            transitions={transitions}
            fieldPermissions={fieldPermissions}
            roleIds={roleIds}
            isAuthor={isAuthor}
            isAssignee={isAssignee}
            priorities={priorities}
            categories={categories}
            versions={versions}
            members={assignableUsers}
            groups={assignableGroups}
            currentAssigneeLabel={currentAssigneeLabel}
            customFields={allCustomFields}
            customValues={Object.fromEntries(customValues.map((cv) => [cv.customFieldId, cv.value ?? ""]))}
            doneRatioEditable={resolveGeneralSettings(settings).issueDoneRatio === "issue_field"}
            canSetPrivate={
              can({ permission: "set_issues_private", project: toAuthorizationProject(project), actor }) ||
              (isAuthor && can({ permission: "set_own_issues_private", project: toAuthorizationProject(project), actor }))
            }
            canManageSubtasks={can({ permission: "manage_subtasks", project: toAuthorizationProject(project), actor })}
            canEditAttributes={canEditThisIssue}
            derivedFields={{
              // The parent_issue_* settings only bite on an issue that actually has subtasks.
              dates: childIssues.length > 0 && resolveGeneralSettings(settings).parentIssueDates === "derived",
              priority: childIssues.length > 0 && resolveGeneralSettings(settings).parentIssuePriority === "derived",
              doneRatio: childIssues.length > 0 && resolveGeneralSettings(settings).parentIssueDoneRatio === "derived",
            }}
          />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">工数（合計 {totalHours}h）</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {visibleTimeEntries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2">
              <span>
                {entry.spentOn} — {entry.hours}h {entry.comments ? `(${entry.comments})` : null}
              </span>
              {canEditTimeEntry({
                entry,
                userId: user?.id ?? null,
                visible: true,
                canEditTimeEntries,
                canEditOwnTimeEntries,
              }) ? (
                <>
                  <Link href={`/projects/${identifier}/time-entries/${entry.id}/edit`} className="text-xs underline">
                    編集
                  </Link>
                  <DeleteTimeEntryButton projectIdentifier={identifier} entryId={entry.id} />
                </>
              ) : null}
            </li>
          ))}
        </ul>
        {canLogTime ? (
          <LogTimeForm
            issueId={issue.id}
            projectIdentifier={identifier}
            activities={activities}
            customFields={timeEntryCustomFields}
            assignableUsers={timeEntryAssignableUsers}
          />
        ) : null}
      </section>

      {childIssues.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">子チケット</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {childIssues.map((child) => (
              <li key={child.id}>
                <Link href={`/projects/${identifier}/issues/${child.id}`} className="underline">
                  {child.subject}
                </Link>
                <span className="text-gray-500 text-xs"> — {statusById.get(child.statusId)?.name ?? "?"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">関連チケット</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {relatedIssues.map(({ relation, issue: other }) =>
            other ? (
              <li key={relation.id} className="flex items-center gap-2">
                <span className="text-gray-500 text-xs">{relationLabelFor(relation, issue.id)}</span>
                <Link href={`/projects/${identifier}/issues/${other.id}`} className="underline">
                  {other.subject}
                </Link>
                <span className="text-gray-500 text-xs">— {statusById.get(other.statusId)?.name ?? "?"}</span>
                {canManageRelations ? (
                  <DeleteIssueRelationButton projectIdentifier={identifier} issueId={issue.id} relationId={relation.id} />
                ) : null}
              </li>
            ) : null,
          )}
          {relatedIssues.length === 0 ? <li className="text-gray-400 text-xs">関連チケットはありません。</li> : null}
        </ul>
        {canManageRelations ? <IssueRelationForm projectIdentifier={identifier} issueId={issue.id} /> : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">添付ファイル</h2>
        <AttachmentList attachments={attachments} />
        {canAttachFiles ? <AttachmentUploadForm issueId={issue.id} projectIdentifier={identifier} /> : null}
      </section>

      {canAddWatchers || canDeleteWatchers || watcherList.length > 0 ? (
        <section>
          <WatcherManager
            issueId={issue.id}
            projectIdentifier={identifier}
            watchers={watcherList}
            candidates={canAddWatchers ? watcherCandidates : []}
            canAdd={canAddWatchers}
            canRemove={canDeleteWatchers}
          />
        </section>
      ) : null}
    </main>
  );
}
