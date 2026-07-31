import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { otherIssueId, relationLabelFor } from "@/application/issues/create-issue-relation";
import { allowedNewStatusIds } from "@/domain/workflow/transition-rules";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleIssueRelationRepository } from "@/infrastructure/db/repositories/issue-relation-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject, visibleIssueFilter } from "@/interface/http/resolve-actor";
import { AttachmentUploadForm } from "./attachment-upload-form";
import { DeleteIssueRelationButton } from "./delete-issue-relation-button";
import { IssueRelationForm } from "./issue-relation-form";
import { LogTimeForm } from "./log-time-form";
import { StatusUpdateForm } from "./status-update-form";
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

  const { actor, roleIds } = await resolveActor(user, project.id);
  if (
    !can({ permission: "view_issues", project: toAuthorizationProject(project), actor }) ||
    !isPrivateIssueVisible(issue, user?.id ?? null, issuesVisibilityRoles(actor))
  ) {
    notFound();
  }

  const [transitions, customFields, customValues, timeEntries, activities, attachments, isWatching, versions] = await Promise.all([
    new DrizzleWorkflowRepository().listForTracker(issue.trackerId),
    new DrizzleCustomFieldRepository().listForTracker(issue.trackerId),
    new DrizzleCustomValueRepository().listForCustomized("Issue", issue.id),
    new DrizzleTimeEntryRepository().listForIssue(issue.id),
    new DrizzleEnumerationRepository().listByType("TimeEntryActivity"),
    new DrizzleAttachmentRepository().listByContainer("Issue", issue.id),
    user ? new DrizzleWatcherRepository().isWatching("Issue", issue.id, user.id) : Promise.resolve(false),
    new DrizzleVersionRepository().listSharedWith(project.id),
  ]);
  const canLogTime = can({ permission: "log_time", project: toAuthorizationProject(project), actor });
  const canEditIssues = can({ permission: "edit_issues", project: toAuthorizationProject(project), actor });
  const canEditOwnIssues = can({ permission: "edit_own_issues", project: toAuthorizationProject(project), actor });
  const canAttachFiles = canEditIssues || (canEditOwnIssues && issue.authorId === user?.id);
  const canManageRelations = can({ permission: "manage_issue_relations", project: toAuthorizationProject(project), actor });
  const canAddWatchers = can({ permission: "add_issue_watchers", project: toAuthorizationProject(project), actor });
  const canDeleteWatchers = can({ permission: "delete_issue_watchers", project: toAuthorizationProject(project), actor });

  const [watcherUserIds, members] = await Promise.all([
    new DrizzleWatcherRepository().listWatcherUserIds("Issue", issue.id),
    new DrizzleMemberRepository().listByProject(project.id),
  ]);
  const relevantUsers = await new DrizzleUserRepository().findByIds([...new Set([...watcherUserIds, ...members.map((m) => m.userId)])]);
  const userLabelById = new Map(relevantUsers.map((u) => [u.id, `${u.lastname} ${u.firstname}`]));
  const watcherList = watcherUserIds.map((id) => ({ id, label: userLabelById.get(id) ?? id }));
  const watcherCandidates = members
    .map((m) => m.userId)
    .filter((userId) => !watcherUserIds.includes(userId))
    .map((id) => ({ id, label: userLabelById.get(id) ?? id }));

  const issueRepository = new DrizzleIssueRepository();
  const [parentIssue, projectIssues, relations] = await Promise.all([
    issue.parentId ? issueRepository.findById(issue.parentId) : Promise.resolve(null),
    issueRepository.listByProject(issue.projectId),
    new DrizzleIssueRelationRepository().listForIssue(issue.id),
  ]);
  const isVisibleToActor = visibleIssueFilter(user?.id ?? null, actor);

  const visibleParentIssue = parentIssue && isVisibleToActor(parentIssue) ? parentIssue : null;
  const childIssues = projectIssues.filter((candidate) => candidate.parentId === issue.id && isVisibleToActor(candidate));
  const relatedIssues = (
    await Promise.all(relations.map(async (relation) => ({ relation, issue: await issueRepository.findById(otherIssueId(relation, issue.id)) })))
  ).filter(({ issue: other }) => other && isVisibleToActor(other));
  const totalHours = timeEntries.reduce((sum, entry) => sum + entry.hours, 0);
  const allowedStatusIds = allowedNewStatusIds(transitions, {
    trackerId: issue.trackerId,
    roleIds,
    currentStatusId: issue.statusId,
    isAuthor: user?.id === issue.authorId,
    isAssignee: user?.id === issue.assignedToId,
  });
  const allowedStatuses = statuses.filter((s) => allowedStatusIds.includes(s.id));
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const customValueByFieldId = new Map(customValues.map((cv) => [cv.customFieldId, cv.value]));

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
        {user ? <WatchToggleForm issueId={issue.id} projectIdentifier={identifier} isWatching={isWatching} /> : null}
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
          {journals.map((journal) => (
            <li key={journal.id} className="border rounded p-2">
              <p className="text-gray-500 text-xs">{journal.createdAt.toISOString()}</p>
              {journal.notes ? <p>{journal.notes}</p> : null}
              {journal.details.map((detail, index) => (
                <p key={index} className="text-xs text-gray-600">
                  {detail.fieldName}: {detail.oldValue ?? "(なし)"} → {detail.newValue ?? "(なし)"}
                </p>
              ))}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-medium mb-2">ステータス更新</h2>
        {allowedStatuses.length > 0 ? (
          <StatusUpdateForm
            issueId={issue.id}
            lockVersion={issue.lockVersion}
            currentStatusId={issue.statusId}
            currentFixedVersionId={issue.fixedVersionId}
            allowedStatuses={allowedStatuses}
            versions={versions}
          />
        ) : (
          <p className="text-sm text-gray-500">このステータスから遷移できるワークフロー設定がありません。</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">工数（合計 {totalHours}h）</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {timeEntries.map((entry) => (
            <li key={entry.id}>
              {entry.spentOn} — {entry.hours}h {entry.comments ? `(${entry.comments})` : null}
            </li>
          ))}
        </ul>
        {canLogTime ? (
          <LogTimeForm issueId={issue.id} projectIdentifier={identifier} activities={activities} />
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
        <ul className="flex flex-col gap-1 text-sm">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <a href={`/api/attachments/${attachment.id}`} className="underline">
                {attachment.filename}
              </a>{" "}
              <span className="text-gray-500 text-xs">({Math.ceil(attachment.fileSize / 1024)} KB)</span>
            </li>
          ))}
        </ul>
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
