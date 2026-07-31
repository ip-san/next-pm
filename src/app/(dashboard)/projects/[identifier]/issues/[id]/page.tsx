import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { allowedNewStatusIds } from "@/domain/workflow/transition-rules";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { AttachmentUploadForm } from "./attachment-upload-form";
import { LogTimeForm } from "./log-time-form";
import { StatusUpdateForm } from "./status-update-form";
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
    </main>
  );
}
