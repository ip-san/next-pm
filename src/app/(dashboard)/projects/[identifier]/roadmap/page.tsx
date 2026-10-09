import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { selectRoadmapVersions } from "@/domain/version/roadmap";
import { computeVersionProgress } from "@/domain/version/progress";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { subtreeVisibleIssues } from "@/interface/http/project-issue-scope";
import { resolveActor, toAuthorizationProject, visibleIssueFilter } from "@/interface/http/resolve-actor";

export const dynamic = "force-dynamic";

/**
 * Mirrors VersionsController#index: shared versions (plus the rolled-up versions of the subtree when
 * display_subprojects_issues is on), each with its visible fixed issues, sorted open-first by due date.
 */
export default async function RoadmapPage({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const { displaySubprojectsIssues } = await loadGeneralSettings(new DrizzleSettingsRepository());
  const subtree = displaySubprojectsIssues ? await subtreeVisibleIssues(user, project) : null;
  const scopeProjectIds = subtree ? [...subtree.identifierByProjectId.keys()] : [project.id];

  const [sharedVersions, rolledUpVersions, ownIssues, allProjects, trackers, statuses] = await Promise.all([
    new DrizzleVersionRepository().listSharedWith(project.id),
    subtree ? new DrizzleVersionRepository().listByProjects(scopeProjectIds) : Promise.resolve([]),
    subtree ? Promise.resolve([]) : new DrizzleIssueRepository().listByProject(project.id),
    new DrizzleProjectRepository().listAll(),
    new DrizzleTrackerRepository().findByIds(project.trackerIds),
    new DrizzleIssueStatusRepository().listAll(),
  ]);
  const visibleIssues = subtree ? subtree.issues : ownIssues.filter(visibleIssueFilter(user?.id ?? null, actor, userGroupIds));
  const projectById = new Map(allProjects.map((entry) => [entry.id, entry]));
  const statusById = new Map(statuses.map((status) => [status.id, status]));
  const trackerPosition = new Map(trackers.map((tracker) => [tracker.id, tracker.position]));

  const entries = selectRoadmapVersions({
    sharedVersions,
    rolledUpVersions,
    scopeProjectIds: new Set(scopeProjectIds),
    visibleIssues: visibleIssues.map((issue) => ({
      ...issue,
      projectLft: projectById.get(issue.projectId)?.lft ?? 0,
      trackerPosition: trackerPosition.get(issue.trackerId) ?? 0,
    })),
    roadmapTrackerIds: new Set(trackers.filter((tracker) => tracker.isInRoadmap).map((tracker) => tracker.id)),
  });

  const openEntries = entries.filter((entry) => entry.version.status === "open");

  return (
    <main className="p-8 flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">ロードマップ</h1>
        <Link href={`/projects/${identifier}/versions`} className="text-sm underline">
          バージョン管理
        </Link>
      </div>

      {openEntries.map(({ version, issues, progressIssues }) => {
        const progress = computeVersionProgress(
          progressIssues.map((issue) => ({ isClosed: statusById.get(issue.statusId)?.isClosed ?? false, doneRatio: issue.doneRatio })),
        );
        return (
          <section key={version.id} className="flex flex-col gap-3">
            <div>
              <h2 className="font-medium">{version.name}</h2>
              <p className="text-xs text-gray-500">
                期日: {version.effectiveDate ?? "未定"} · 未完了 {progress.openCount}件 · 完了 {progress.closedCount}件
              </p>
              <div className="w-full max-w-sm h-2 rounded bg-gray-200 mt-1">
                <div className="h-2 rounded bg-black" style={{ width: `${Math.round(progress.completedPercent)}%` }} />
              </div>
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {issues.map((issue) => {
                const issueProject = projectById.get(issue.projectId);
                const isOtherProject = issue.projectId !== project.id;
                return (
                  <li key={issue.id}>
                    <Link href={`/projects/${issueProject?.identifier ?? identifier}/issues/${issue.id}`} className="underline">
                      {isOtherProject ? `${issueProject?.name ?? ""} - ` : null}#{issue.number} {issue.subject}
                    </Link>
                    <span className="text-gray-500 text-xs"> — {statusById.get(issue.statusId)?.name ?? "?"}</span>
                  </li>
                );
              })}
              {issues.length === 0 ? <li className="text-gray-400 text-xs">チケットはありません。</li> : null}
            </ul>
          </section>
        );
      })}
      {openEntries.length === 0 ? <p className="text-sm text-gray-500">進行中のバージョンはありません。</p> : null}
    </main>
  );
}
