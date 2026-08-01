import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import type { Issue } from "@/domain/issue/entity";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject, visibleIssueFilter } from "@/interface/http/resolve-actor";

function IssueList({ title, issues, projectIdentifierById, statusNameById }: {
  title: string;
  issues: Issue[];
  projectIdentifierById: Map<string, string>;
  statusNameById: Map<string, string>;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold text-sm">
        {title} ({issues.length})
      </h2>
      {issues.length === 0 ? (
        <p className="text-sm text-gray-500">なし</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {issues.map((issue) => {
            const identifier = projectIdentifierById.get(issue.projectId);
            return (
              <li key={issue.id} className="border-b pb-1">
                {identifier ? (
                  <Link href={`/projects/${identifier}/issues/${issue.id}`} className="underline">
                    {issue.subject}
                  </Link>
                ) : (
                  issue.subject
                )}{" "}
                <span className="text-gray-500">— {statusNameById.get(issue.statusId) ?? "?"}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default async function MyPage() {
  const user = await currentUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const issueRepository = new DrizzleIssueRepository();
  const userGroupIds = await new DrizzleGroupRepository().listGroupIdsForUser(user.id);
  const [assigned, reported, watchedIds] = await Promise.all([
    issueRepository.findByAssignee(user.id, userGroupIds),
    issueRepository.findByAuthor(user.id),
    new DrizzleWatcherRepository().listWatchedIds("Issue", user.id),
  ]);
  const watched = await issueRepository.findByIds(watchedIds);

  // Each list spans every project the issue happens to live in — resolve visibility once per
  // distinct project referenced across all three lists, rather than per issue.
  const projectIds = new Set([...assigned, ...reported, ...watched].map((issue) => issue.projectId));
  const projectRepository = new DrizzleProjectRepository();
  const visibleProjectIds = new Set<string>();
  const projectIdentifierById = new Map<string, string>();
  const issueFilters = new Map<string, (issue: Issue) => boolean>();
  await Promise.all(
    [...projectIds].map(async (projectId) => {
      const project = await projectRepository.findById(projectId);
      if (!project) return;
      const { actor, userGroupIds: actorGroupIds } = await resolveActor(user, projectId);
      if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) return;
      visibleProjectIds.add(projectId);
      projectIdentifierById.set(projectId, project.identifier);
      issueFilters.set(projectId, visibleIssueFilter(user.id, actor, actorGroupIds));
    }),
  );

  function visibleOnly(issues: Issue[]): Issue[] {
    return issues.filter((issue) => visibleProjectIds.has(issue.projectId) && (issueFilters.get(issue.projectId)?.(issue) ?? false));
  }

  const statuses = await new DrizzleIssueStatusRepository().listAll();
  const statusNameById = new Map(statuses.map((s) => [s.id, s.name]));

  return (
    <main className="p-8 flex flex-col gap-8 max-w-3xl">
      <h1 className="text-xl font-semibold">マイページ</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <IssueList title="担当しているチケット" issues={visibleOnly(assigned)} projectIdentifierById={projectIdentifierById} statusNameById={statusNameById} />
        <IssueList title="登録したチケット" issues={visibleOnly(reported)} projectIdentifierById={projectIdentifierById} statusNameById={statusNameById} />
        <IssueList title="ウォッチしているチケット" issues={visibleOnly(watched)} projectIdentifierById={projectIdentifierById} statusNameById={statusNameById} />
      </div>
    </main>
  );
}
