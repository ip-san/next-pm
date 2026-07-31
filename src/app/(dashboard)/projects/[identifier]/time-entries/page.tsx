import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

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
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_time_entries", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const [entries, activities] = await Promise.all([
    new DrizzleTimeEntryRepository().listForProject(project.id),
    new DrizzleEnumerationRepository().listByType("TimeEntryActivity"),
  ]);
  const activityById = new Map(activities.map((a) => [a.id, a]));

  const issueIds = [...new Set(entries.map((e) => e.issueId).filter((id): id is string => id !== null))];
  const issueRepository = new DrizzleIssueRepository();
  const issues = await Promise.all(issueIds.map((id) => issueRepository.findById(id)));
  const issueById = new Map(issues.filter((i) => i !== null).map((i) => [i.id, i]));

  const totalHours = entries.reduce((sum, entry) => sum + entry.hours, 0);

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">
        {project.name} — 工数（合計 {totalHours}h）
      </h1>
      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="pr-4 py-1">日付</th>
            <th className="pr-4 py-1">チケット</th>
            <th className="pr-4 py-1">分類</th>
            <th className="pr-4 py-1">時間</th>
            <th className="pr-4 py-1">コメント</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b">
              <td className="pr-4 py-1">{entry.spentOn}</td>
              <td className="pr-4 py-1">
                {entry.issueId ? issueById.get(entry.issueId)?.subject ?? entry.issueId.slice(0, 8) : "-"}
              </td>
              <td className="pr-4 py-1">{activityById.get(entry.activityId)?.name ?? "?"}</td>
              <td className="pr-4 py-1">{entry.hours}h</td>
              <td className="pr-4 py-1">{entry.comments}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
