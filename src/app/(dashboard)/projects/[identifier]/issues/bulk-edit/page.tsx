import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { memberUserIds } from "@/domain/member/entity";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { BulkEditForm } from "./bulk-edit-form";

export const dynamic = "force-dynamic";

function normalizeIds(ids: string | string[] | undefined): string[] {
  if (!ids) return [];
  return Array.isArray(ids) ? ids : [ids];
}

export default async function BulkEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const { identifier } = await params;
  const { ids } = await searchParams;
  const requestedIds = normalizeIds(ids);

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const issueRepository = new DrizzleIssueRepository();
  const candidateIssues = (await Promise.all(requestedIds.map((id) => issueRepository.findById(id)))).filter(
    (issue): issue is NonNullable<typeof issue> => issue !== null,
  );

  const visibilityRoles = issuesVisibilityRoles(actor);
  const canEditAny = can({ permission: "edit_issues", project: toAuthorizationProject(project), actor });
  const canEditOwn = can({ permission: "edit_own_issues", project: toAuthorizationProject(project), actor });

  // Same re-derive-from-the-record pattern used everywhere else in this app: only issues
  // that actually belong to this project, are visible to the actor, and are editable by
  // them stay selected — the client-supplied id list is never trusted past this filter.
  const issues = candidateIssues.filter(
    (issue) =>
      issue.projectId === project.id &&
      isPrivateIssueVisible(issue, user?.id ?? null, visibilityRoles) &&
      (canEditAny || (canEditOwn && issue.authorId === user?.id)),
  );

  if (issues.length === 0) {
    return (
      <main className="p-8 flex flex-col gap-4">
        <h1 className="text-xl font-semibold">一括編集</h1>
        <p className="text-sm text-gray-500">編集可能なチケットが選択されていません。</p>
      </main>
    );
  }

  const [statuses, priorities, members] = await Promise.all([
    new DrizzleIssueStatusRepository().listAll(),
    new DrizzleEnumerationRepository().listByType("IssuePriority"),
    new DrizzleMemberRepository().listByProject(project.id),
  ]);
  const memberUsers = await new DrizzleUserRepository().findByIds(memberUserIds(members));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">一括編集（{issues.length}件）</h1>
      <ul className="text-sm text-gray-600 flex flex-col gap-1">
        {issues.map((issue) => (
          <li key={issue.id}>
            #{issue.id.slice(0, 8)} {issue.subject}
          </li>
        ))}
      </ul>
      <BulkEditForm
        projectIdentifier={identifier}
        issueIds={issues.map((issue) => issue.id)}
        statuses={statuses}
        priorities={priorities}
        members={memberUsers}
      />
    </main>
  );
}
