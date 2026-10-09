import { customFieldViewerFor } from "@/interface/http/custom-field-viewer";
import { visibleCustomFieldsFor } from "@/domain/custom-field/visibility";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { memberUserIds } from "@/domain/member/entity";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleIssueCategoryRepository } from "@/infrastructure/db/repositories/issue-category-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { BulkEditForm } from "./bulk-edit-form";

export const dynamic = "force-dynamic";

function normalizeIds(ids: string | string[] | undefined): string[] {
  if (!ids) return [];
  // Ids come from the query string; anything that isn't a uuid is dropped before it reaches the database.
  return (Array.isArray(ids) ? ids : [ids]).filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
}

export default async function BulkEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const locale = await currentLocale();
  const { identifier } = await params;
  const { ids } = await searchParams;
  const requestedIds = normalizeIds(ids);

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor, userGroupIds, roleIds } = await resolveActor(user, project.id);
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
  const canSetNotesPrivate = can({ permission: "set_notes_private", project: toAuthorizationProject(project), actor });

  // Same re-derive-from-the-record pattern used everywhere else in this app: only issues
  // that actually belong to this project, are visible to the actor, and are editable by
  // them stay selected — the client-supplied id list is never trusted past this filter.
  const issues = candidateIssues.filter(
    (issue) =>
      issue.projectId === project.id &&
      isPrivateIssueVisible(issue, user?.id ?? null, userGroupIds, visibilityRoles) &&
      (canEditAny || (canEditOwn && issue.authorId === user?.id)),
  );

  if (issues.length === 0) {
    return (
      <main className="p-8 flex flex-col gap-4">
        <h1 className="text-xl font-semibold">{translate(locale, "issueBulkEdit.title")}</h1>
        <p className="text-sm text-gray-500">{translate(locale, "issueBulkEdit.none")}</p>
      </main>
    );
  }

  const [statuses, priorities, members, trackers, categories, versions] = await Promise.all([
    new DrizzleIssueStatusRepository().listAll(),
    new DrizzleEnumerationRepository().listByType("IssuePriority"),
    new DrizzleMemberRepository().listByProject(project.id),
    new DrizzleTrackerRepository().findByIds(project.trackerIds),
    new DrizzleIssueCategoryRepository().listByProject(project.id),
    new DrizzleVersionRepository().listSharedWith(project.id),
  ]);
  // Mirrors Issue.available_custom_fields(issues): only fields every selected issue's
  // tracker enables, since a value set here has to be applicable to all of them.
  const selectedTrackerIds = [...new Set(candidateIssues.map((issue) => issue.trackerId))];
  const customFieldsPerTracker = await Promise.all(
    selectedTrackerIds.map((trackerId) => new DrizzleCustomFieldRepository().listForTracker(trackerId)),
  );
  const commonCustomFields = (customFieldsPerTracker[0] ?? []).filter((field) =>
    customFieldsPerTracker.every((fields) => fields.some((candidate) => candidate.id === field.id)),
  );
  const memberUsers = await new DrizzleUserRepository().findByIds(memberUserIds(members));
  const projectGroupIds = new Set(members.flatMap((member) => (member.groupId ? [member.groupId] : [])));
  const groups = (await new DrizzleGroupRepository().listAll()).filter((group) => projectGroupIds.has(group.id));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{interpolate(translate(locale, "issueBulkEdit.count"), { count: issues.length })}</h1>
      <ul className="text-sm text-gray-600 flex flex-col gap-1">
        {issues.map((issue) => (
          <li key={issue.id}>
            #{issue.number} {issue.subject}
          </li>
        ))}
      </ul>
      <BulkEditForm
        trackers={trackers}
        categories={categories}
        versions={versions}
        customFields={visibleCustomFieldsFor(commonCustomFields, customFieldViewerFor(user, roleIds))}
        canSetNotesPrivate={canSetNotesPrivate}
        projectIdentifier={identifier}
        issueIds={issues.map((issue) => issue.id)}
        statuses={statuses}
        priorities={priorities}
        members={memberUsers}
        groups={groups}
        locale={locale}
      />
    </main>
  );
}
