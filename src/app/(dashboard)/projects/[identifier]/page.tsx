import { FormattedText } from "@/interface/components/formatted-text";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { memberUserIds } from "@/domain/member/entity";
import { aggregateIssueCounts } from "@/domain/report/issue-report";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { currentLocale } from "@/interface/http/locale";
import { resolveActor, toAuthorizationProject, visibleIssueFilter } from "@/interface/http/resolve-actor";
import { DeleteProjectForm } from "../delete-project-form";
import { ProjectStatusButton } from "../project-status-button";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

const NAV_LINKS: { module: string; path: string; labelKey: MessageKey }[] = [
  { module: "issue_tracking", path: "issues", labelKey: "projectMenu.issues" },
  { module: "issue_tracking", path: "roadmap", labelKey: "projectMenu.roadmap" },
  { module: "calendar", path: "calendar", labelKey: "projectMenu.calendar" },
  { module: "gantt", path: "gantt", labelKey: "projectMenu.gantt" },
  { module: "time_tracking", path: "time-entries", labelKey: "projectMenu.timeEntries" },
  { module: "wiki", path: "wiki", labelKey: "projectMenu.wiki" },
  { module: "boards", path: "boards", labelKey: "projectMenu.boards" },
  { module: "news", path: "news", labelKey: "projectMenu.news" },
  { module: "documents", path: "documents", labelKey: "projectMenu.documents" },
  { module: "files", path: "files", labelKey: "projectMenu.files" },
  { module: "repository", path: "repository", labelKey: "projectMenu.repository" },
];

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const locale = await currentLocale();
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (!can({ permission: "view_project", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const canEditProject = can({ permission: "edit_project", project: toAuthorizationProject(project), actor });
  // Redmine renders 閉鎖/再開 in the project action menu, gated by close_project — which is a
  // read permission, so it stays available on an already-closed project (that is how it is
  // reopened at all). Archive/unarchive are admin-only and live on the admin projects list.
  const canCloseProject = can({ permission: "close_project", project: toAuthorizationProject(project), actor });
  const canDeleteProject = can({ permission: "delete_project", project: toAuthorizationProject(project), actor });
  const canViewMembers = can({ permission: "view_members", project: toAuthorizationProject(project), actor });
  const canManageIssueCategories =
    project.enabledModules.includes("issue_tracking") &&
    can({ permission: "manage_issue_categories", project: toAuthorizationProject(project), actor });
  const canViewIssues =
    project.enabledModules.includes("issue_tracking") &&
    can({ permission: "view_issues", project: toAuthorizationProject(project), actor });
  const canViewNews =
    project.enabledModules.includes("news") && can({ permission: "view_news", project: toAuthorizationProject(project), actor });

  const [subprojectCandidates, members, trackers, statuses] = await Promise.all([
    new DrizzleProjectRepository().listDescendants(project.id),
    new DrizzleMemberRepository().listByProject(project.id),
    // Every tracker, not just `project.trackerIds` — an issue's tracker can have been removed
    // from the project afterward (settings page), and its issues should still show up here
    // rather than being silently dropped from the counts, mirroring the reports page's
    // `row.counts.total > 0` filter below.
    new DrizzleTrackerRepository().listAll(),
    new DrizzleIssueStatusRepository().listAll(),
  ]);
  // Each child gets its own resolveActor/can: membership is per project, so a subproject can
  // be private to this viewer even when its parent is not — and an archived one must drop out
  // of the box entirely, which `can` already does for every permission including view_project.
  const subprojects: typeof subprojectCandidates = [];
  for (const candidate of subprojectCandidates) {
    if (candidate.parentId !== project.id) continue;
    const { actor: childActor } = await resolveActor(user, candidate.id);
    if (can({ permission: "view_project", project: toAuthorizationProject(candidate), actor: childActor })) {
      subprojects.push(candidate);
    }
  }

  const [roles, users, groups] = await Promise.all([
    new DrizzleRoleRepository().findByIds(members.flatMap((m) => m.roleIds)),
    new DrizzleUserRepository().findByIds(memberUserIds(members)),
    new DrizzleGroupRepository().listAll(),
  ]);
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const principalsByRole = new Map<string, string[]>();
  for (const member of members) {
    // Only direct memberships — inherited-from-group rows would otherwise double-list a
    // group's members under their own name as well as the group's.
    if (member.inheritedFromMemberId) continue;
    const label = member.groupId
      ? (groupById.get(member.groupId)?.name ?? "?")
      : userById.get(member.userId ?? "")
        ? `${userById.get(member.userId ?? "")!.lastname} ${userById.get(member.userId ?? "")!.firstname}`
        : "?";
    for (const roleId of member.roleIds) {
      const roleName = roleById.get(roleId)?.name ?? "?";
      const list = principalsByRole.get(roleName) ?? [];
      list.push(label);
      principalsByRole.set(roleName, list);
    }
  }

  let trackerRows: { id: string; name: string; open: number; closed: number; total: number }[] = [];
  if (canViewIssues) {
    const allIssues = await new DrizzleIssueRepository().listByProject(project.id);
    const issues = allIssues.filter(visibleIssueFilter(user?.id ?? null, actor, userGroupIds));
    const closedStatusIds = new Set(statuses.filter((s) => s.isClosed).map((s) => s.id));
    const counts = aggregateIssueCounts(issues, closedStatusIds, (issue) => issue.trackerId);
    trackerRows = trackers
      .map((tracker) => {
        const row = counts.get(tracker.id) ?? { open: 0, closed: 0, total: 0 };
        return { id: tracker.id, name: tracker.name, ...row };
      })
      .filter((row) => row.total > 0);
  }

  const latestNews = canViewNews ? (await new DrizzleNewsRepository().listByProject(project.id)).slice(0, 3) : [];

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{project.name}</h1>
      <nav className="flex gap-3 text-sm">
        <Link href={`/projects/${identifier}/activity`} className="underline">
          {translate(locale, "projectMenu.activity")}
        </Link>
        {NAV_LINKS.filter((link) => project.enabledModules.includes(link.module)).map((link) => (
          <Link key={link.path} href={`/projects/${identifier}/${link.path}`} className="underline">
            {translate(locale, link.labelKey)}
          </Link>
        ))}
        <Link href={`/projects/${identifier}/search`} className="underline">
          {translate(locale, "projectMenu.search")}
        </Link>
        {canManageIssueCategories ? (
          <Link href={`/projects/${identifier}/issue-categories`} className="underline">
            {translate(locale, "projectMenu.issueCategories")}
          </Link>
        ) : null}
        {canEditProject ? (
          <Link href={`/projects/${identifier}/settings`} className="underline">
            {translate(locale, "projectMenu.settings")}
          </Link>
        ) : null}
        {user?.isAdmin ? (
          <Link href={`/projects/${identifier}/copy`} className="underline">
            {translate(locale, "projectMenu.copy")}
          </Link>
        ) : null}
        {canCloseProject ? (
          <ProjectStatusButton projectIdentifier={identifier} transition={project.status === "closed" ? "reopen" : "close"} />
        ) : null}
        {/* Project#deletable? also demands leaf? for a non-admin; the use case re-checks, so
            a subproject owner sees the form and is told why rather than silently missing it. */}
        {canDeleteProject ? <DeleteProjectForm projectIdentifier={identifier} /> : null}
      </nav>
      {project.status === "closed" ? (
        <p className="text-sm text-amber-700">{translate(locale, "project.closedNotice")}</p>
      ) : null}
      <FormattedText project={project} text={project.description} className="text-gray-600" />
      <dl className="text-sm flex flex-col gap-1">
        <div>
          <dt className="inline font-medium">{translate(locale, "project.identifier")}: </dt>
          <dd className="inline">{project.identifier}</dd>
        </div>
        <div>
          <dt className="inline font-medium">{translate(locale, "project.isPublic")}: </dt>
          <dd className="inline">{project.isPublic ? translate(locale, "project.yes") : translate(locale, "project.no")}</dd>
        </div>
        <div>
          <dt className="inline font-medium">{translate(locale, "project.enabledModules")}: </dt>
          <dd className="inline">{project.enabledModules.join(", ") || translate(locale, "project.noModules")}</dd>
        </div>
        <div>
          <dt className="inline font-medium">nested set: </dt>
          <dd className="inline">
            lft={project.lft}, rgt={project.rgt}
          </dd>
        </div>
      </dl>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="flex flex-col gap-6">
          {canViewIssues ? (
            <section className="flex flex-col gap-2">
              <h2 className="font-semibold text-sm">{translate(locale, "project.issueTracking")}</h2>
              {trackerRows.length > 0 ? (
                <table className="text-sm border-collapse w-full">
                  <thead>
                    <tr className="border-b text-left">
                      <th scope="col" className="pr-4 py-0.5" />
                      <th scope="col" className="pr-4 py-0.5 text-right">{translate(locale, "project.statusOpen")}</th>
                      <th scope="col" className="pr-4 py-0.5 text-right">{translate(locale, "project.statusClosed")}</th>
                      <th scope="col" className="pr-4 py-0.5 text-right">{translate(locale, "project.total")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trackerRows.map((row) => (
                      <tr key={row.id} className="border-b">
                        {/* The issues page's filter only understands status_id/query_id, not a tracker id
                            in the URL — plain text here rather than a link that silently ignores the param. */}
                        <th scope="row" className="pr-4 py-0.5 text-left font-normal">{row.name}</th>
                        <td className="pr-4 py-0.5 text-right">{row.open}</td>
                        <td className="pr-4 py-0.5 text-right">{row.closed}</td>
                        <td className="pr-4 py-0.5 text-right">{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-gray-500">{translate(locale, "project.noIssues")}</p>
              )}
              <p className="text-sm">
                <Link href={`/projects/${identifier}/issues`} className="underline">
                  {translate(locale, "project.viewAllIssues")}
                </Link>
                {" | "}
                <Link href={`/projects/${identifier}/reports`} className="underline">
                  {translate(locale, "project.reports")}
                </Link>
              </p>
            </section>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          {canViewNews && latestNews.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="font-semibold text-sm">{translate(locale, "project.latestNews")}</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {latestNews.map((item) => (
                  <li key={item.id}>
                    <Link href={`/projects/${identifier}/news/${item.id}`} className="underline">
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="text-sm">
                <Link href={`/projects/${identifier}/news`} className="underline">
                  {translate(locale, "project.viewAllNews")}
                </Link>
              </p>
            </section>
          ) : null}

          {/* Redmine gates the members box on view_members (MembersController#index). */}
          {canViewMembers && principalsByRole.size > 0 ? (
            <section className="flex flex-col gap-1">
              <h2 className="font-semibold text-sm">{translate(locale, "project.members")}</h2>
              {[...principalsByRole.keys()].sort().map((roleName) => (
                <p key={roleName} className="text-sm">
                  <span className="font-medium">{roleName}: </span>
                  {principalsByRole.get(roleName)!.sort().join(", ")}
                </p>
              ))}
            </section>
          ) : null}

          {subprojects.length > 0 ? (
            <section className="flex flex-col gap-1">
              <h2 className="font-semibold text-sm">{translate(locale, "project.subprojects")}</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {subprojects.map((subproject) => (
                  <li key={subproject.id}>
                    <Link href={`/projects/${subproject.identifier}`} className="underline">
                      {subproject.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
