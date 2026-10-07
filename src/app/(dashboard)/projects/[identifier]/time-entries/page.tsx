import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { canEditTimeEntry } from "@/domain/time-entry/visibility";
import { loadProjectActivities } from "@/application/time-entries/project-activities";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleProjectActivityRepository } from "@/infrastructure/db/repositories/project-activity-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { filterAccessibleTimeEntries } from "@/interface/http/time-entry-access";
import { DeleteTimeEntryButton } from "./delete-time-entry-button";

export default async function ProjectTimeEntriesPage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const projectContext = toAuthorizationProject(project);
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (!can({ permission: "view_time_entries", project: projectContext, actor })) {
    notFound();
  }

  const [allEntries, { byId: activityById }] = await Promise.all([
    new DrizzleTimeEntryRepository().listForProject(project.id),
    // byId, not the offered list: an entry recorded before the project deactivated an
    // activity still has to show that activity's name.
    loadProjectActivities(
      { enumerationRepository: new DrizzleEnumerationRepository(), projectActivityRepository: new DrizzleProjectActivityRepository() },
      project.id,
    ),
  ]);

  const issueIds = [...new Set(allEntries.map((e) => e.issueId).filter((id): id is string => id !== null))];
  const issueRepository = new DrizzleIssueRepository();
  const issues = await Promise.all(issueIds.map((id) => issueRepository.findById(id)));
  const issueById = new Map(issues.filter((i) => i !== null).map((i) => [i.id, i]));

  // The shared read predicate: view_time_entries, the role's time_entries_visibility, and
  // the private-issue rule (an entry against an issue the viewer can't see must not leak
  // that issue's subject, or even the fact that time was logged against it).
  const entries = filterAccessibleTimeEntries(allEntries, {
    userId: user?.id ?? null,
    actor,
    userGroupIds,
    projectContext,
    issueById,
  });

  const entryUsers = await new DrizzleUserRepository().findByIds([...new Set(entries.map((entry) => entry.userId))]);
  const userLabelById = new Map(entryUsers.map((u) => [u.id, `${u.lastname} ${u.firstname}`]));

  const totalHours = entries.reduce((sum, entry) => sum + entry.hours, 0);
  const canLogTime = can({ permission: "log_time", project: projectContext, actor });
  const canImport = can({ permission: "import_time_entries", project: projectContext, actor }) && canLogTime;
  const canEditTimeEntries = can({ permission: "edit_time_entries", project: projectContext, actor });
  const canEditOwnTimeEntries = can({ permission: "edit_own_time_entries", project: projectContext, actor });
  const editable = (entry: { userId: string }) =>
    canEditTimeEntry({ entry, userId: user?.id ?? null, visible: true, canEditTimeEntries, canEditOwnTimeEntries });

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {project.name} — 工数（合計 {totalHours}h）
        </h1>
        <div className="flex items-center gap-4 text-sm">
          {canLogTime ? (
            <Link href={`/projects/${identifier}/time-entries/new`} className="underline">
              工数を記録
            </Link>
          ) : null}
          {canImport ? (
            <Link href={`/projects/${identifier}/time-entries/import`} className="underline">
              CSVの取り込み
            </Link>
          ) : null}
          <a href={`/api/projects/${identifier}/time-entries/csv`} className="underline">
            CSV
          </a>
          <Link href={`/projects/${identifier}/time-entries/report`} className="underline">
            レポートを見る
          </Link>
        </div>
      </div>
      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="pr-4 py-1">日付</th>
            <th className="pr-4 py-1">ユーザー</th>
            <th className="pr-4 py-1">チケット</th>
            <th className="pr-4 py-1">分類</th>
            <th className="pr-4 py-1">時間</th>
            <th className="pr-4 py-1">コメント</th>
            <th className="pr-4 py-1"></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b">
              <td className="pr-4 py-1">{entry.spentOn}</td>
              <td className="pr-4 py-1">{userLabelById.get(entry.userId) ?? "-"}</td>
              <td className="pr-4 py-1">
                {entry.issueId ? issueById.get(entry.issueId)?.subject ?? entry.issueId.slice(0, 8) : "-"}
              </td>
              <td className="pr-4 py-1">{activityById.get(entry.activityId)?.name ?? "?"}</td>
              <td className="pr-4 py-1">{entry.hours}h</td>
              <td className="pr-4 py-1">{entry.comments}</td>
              <td className="pr-4 py-1 whitespace-nowrap">
                {editable(entry) ? (
                  <span className="flex items-center gap-2">
                    <Link href={`/projects/${identifier}/time-entries/${entry.id}/edit`} className="text-xs underline">
                      編集
                    </Link>
                    <DeleteTimeEntryButton projectIdentifier={identifier} entryId={entry.id} />
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
