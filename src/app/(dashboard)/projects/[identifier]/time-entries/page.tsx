import Link from "next/link";
import { notFound } from "next/navigation";
import { listTimeEntries } from "@/application/time-entries/list-time-entries";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { can } from "@/domain/authorization/authorization-service";
import type { SavedQuery } from "@/domain/query/entity";
import { isQueryEditable, isQueryVisible } from "@/domain/query/visibility";
import { canEditTimeEntry } from "@/domain/time-entry/visibility";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { loadProjectActivities } from "@/application/time-entries/project-activities";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectActivityRepository } from "@/infrastructure/db/repositories/project-activity-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleQueryRepository } from "@/infrastructure/db/repositories/query-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTimeEntrySearchRepository } from "@/infrastructure/db/repositories/time-entry-search-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { memberUserIds } from "@/domain/member/entity";
import { IssueQueryForm, type FilterValueOption } from "@/interface/components/query/issue-query-form";
import { SaveQueryForm, SavedQueryControls } from "@/interface/components/query/save-query-form";
import { TimeEntryTable } from "@/interface/components/query/time-entry-table";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { listVisibleProjectContexts, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { loadTimeEntryLookups, timeEntryProjectScope } from "@/interface/http/time-entry-list";
import { normalizeSearchParams, parseIssueListParams, serializeIssueListParams } from "@/interface/query/issue-query-params";

export const dynamic = "force-dynamic";

/**
 * `TimelogController#index` for one project — the same query engine as `/time_entries`,
 * with the scope fixed to this project. The report page (`./report`) is unchanged: Redmine
 * keeps `#report` as its own action with its own criteria/columns params.
 */
export default async function ProjectTimeEntriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { identifier } = await params;
  const listParams = parseIssueListParams(normalizeSearchParams(await searchParams));

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const projectContext = toAuthorizationProject(project);
  const resolved = await resolveActor(user, project.id);
  const { actor, roleIds } = resolved;
  if (!can({ permission: "view_time_entries", project: projectContext, actor })) {
    notFound();
  }

  const projectEntry = { ...resolved, project, projectContext };
  const userGroupIds = user ? await new DrizzleGroupRepository().listGroupIdsForUser(user.id) : [];

  const allQueries = await new DrizzleQueryRepository().listAvailableFor(project.id, "TimeEntryQuery");
  const visibleQueries = allQueries.filter((query) => user?.isAdmin || isQueryVisible(query, user?.id ?? "", roleIds));
  let savedQuery: SavedQuery | null = null;
  if (listParams.queryId) {
    savedQuery = visibleQueries.find((query) => query.id === listParams.queryId) ?? null;
  }

  // display_subprojects_issues: the list also covers the subprojects, each judged by its own project's rules.
  const { displaySubprojectsIssues } = await loadGeneralSettings(new DrizzleSettingsRepository());
  const subtreeEntries = displaySubprojectsIssues
    ? (await listVisibleProjectContexts(user, "view_project")).filter(
        (entry) => entry.project.lft >= project.lft && entry.project.rgt <= project.rgt,
      )
    : [];
  const scopeEntries = subtreeEntries.length > 0 ? subtreeEntries : [projectEntry];
  const projectIdentifierById = new Map(scopeEntries.map((entry) => [entry.project.id, entry.project.identifier]));

  const result = await listTimeEntries(
    {
      timeEntrySearchRepository: new DrizzleTimeEntrySearchRepository(),
      customFieldRepository: new DrizzleCustomFieldRepository(),
      settingsRepository: new DrizzleSettingsRepository(),
    },
    {
      params: listParams,
      savedQuery,
      visibility: { userId: user?.id ?? null, userGroupIds, projects: scopeEntries.map(timeEntryProjectScope) },
      crossProject: false,
      today: new Date().toISOString().slice(0, 10),
    },
  );

  const lookups = await loadTimeEntryLookups(scopeEntries, {
    issueIds: [...new Set(result.search.entries.map((entry) => entry.issueId).filter((id): id is string => id !== null))],
    userIds: [...new Set(result.search.entries.flatMap((entry) => [entry.userId, entry.authorId]))],
  });

  const [activities, members, roles] = await Promise.all([
    loadProjectActivities(
      { enumerationRepository: new DrizzleEnumerationRepository(), projectActivityRepository: new DrizzleProjectActivityRepository() },
      project.id,
    ).then((view) => view.offered),
    new DrizzleMemberRepository().listByProject(project.id),
    new DrizzleRoleRepository().listAssignable(),
  ]);
  const memberUsers = await new DrizzleUserRepository().findByIds(memberUserIds(members));

  const canLogTime = can({ permission: "log_time", project: projectContext, actor });
  const canImport = can({ permission: "import_time_entries", project: projectContext, actor }) && canLogTime;
  const canEditTimeEntries = can({ permission: "edit_time_entries", project: projectContext, actor });
  const canEditOwnTimeEntries = can({ permission: "edit_own_time_entries", project: projectContext, actor });
  const canSaveQueries = can({ permission: "save_queries", project: projectContext, actor });
  const canManagePublicQueries = can({ permission: "manage_public_queries", project: projectContext, actor });
  const queryActor = { userId: user?.id ?? null, isAdmin: user?.isAdmin ?? false, canManagePublicQueries };

  const basePath = `/projects/${identifier}/time-entries`;
  const exportParams = serializeIssueListParams({ ...listParams, ...result.effective, page: undefined }).toString();

  const valueOptions: Record<string, FilterValueOption[]> = {
    activity_id: activities.map((activity) => ({ value: activity.id, label: activity.name })),
    user_id: userFilterOptions(memberUsers, user?.id),
    author_id: userFilterOptions(memberUsers, user?.id),
    ...Object.fromEntries(
      result.customFields
        .filter((field) => field.fieldFormat === "list" || field.fieldFormat === "bool")
        .map((field) => [
          `cf_${field.id}`,
          field.fieldFormat === "bool"
            ? [
                { value: "1", label: "はい" },
                { value: "0", label: "いいえ" },
              ]
            : field.possibleValues.map((value) => ({ value, label: value })),
        ]),
    ),
  };

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{project.name} — 工数</h1>
        <div className="flex items-center gap-4 text-sm">
          {canLogTime ? (
            <Link href={`${basePath}/new`} className="underline">
              工数を記録
            </Link>
          ) : null}
          {canImport ? (
            <Link href={`${basePath}/import`} className="underline">
              CSVの取り込み
            </Link>
          ) : null}
          <a href={`/api/projects/${identifier}/time-entries/query-csv?${exportParams}`} className="underline">
            CSV
          </a>
          {/* The fixed-column export the importer round-trips with — see §9 of the parity checklist. */}
          <a href={`/api/projects/${identifier}/time-entries/csv`} className="underline">
            CSV(取り込み形式)
          </a>
          <Link href={`${basePath}/report`} className="underline">
            レポートを見る
          </Link>
        </div>
      </div>

      {visibleQueries.length > 0 && (
        <nav className="flex items-center gap-3 text-sm flex-wrap">
          <span className="text-gray-500">保存済みクエリ:</span>
          <Link href={basePath} className={!savedQuery ? "font-semibold underline" : "underline"}>
            (絞り込みなし)
          </Link>
          {visibleQueries.map((query) => (
            <Link
              key={query.id}
              href={`${basePath}?query_id=${query.id}`}
              className={savedQuery?.id === query.id ? "font-semibold underline" : "underline"}
            >
              {query.name}
            </Link>
          ))}
        </nav>
      )}

      <IssueQueryForm
        action={basePath}
        columns={result.availableColumns}
        valueOptions={valueOptions}
        initialFilters={result.effective.filters}
        initialColumnKeys={result.displayColumns.map((column) => column.key)}
        initialGroupBy={result.effective.groupBy}
        initialTotalableKeys={result.effective.totalableNames}
        sortCriteria={result.effective.sortCriteria}
        perPage={String(result.pagination.perPage)}
        queryId={savedQuery?.id}
      />

      <SaveQueryForm
        projectIdentifier={identifier}
        queryType="TimeEntryQuery"
        options={result.effective}
        canPublish={canManagePublicQueries}
        canSave={canSaveQueries}
        roles={roles.map((role) => ({ id: role.id, name: role.name }))}
        editing={
          savedQuery && isQueryEditable(savedQuery, queryActor)
            ? { id: savedQuery.id, name: savedQuery.name, visibility: savedQuery.visibility, roleIds: savedQuery.roleIds }
            : undefined
        }
      />

      {savedQuery ? (
        <SavedQueryControls
          projectIdentifier={identifier}
          queryType="TimeEntryQuery"
          query={{ id: savedQuery.id, name: savedQuery.name, visibility: savedQuery.visibility, roleIds: savedQuery.roleIds }}
          canDelete={isQueryEditable(savedQuery, queryActor)}
          canCopy={canSaveQueries}
        />
      ) : null}

      <TimeEntryTable
        result={result}
        lookups={lookups}
        basePath={basePath}
        listParams={listParams}
        projectIdentifierById={projectIdentifierById}
        isEditable={(entry) =>
          canEditTimeEntry({ entry, userId: user?.id ?? null, visible: true, canEditTimeEntries, canEditOwnTimeEntries })
        }
        // Bulk edit acts on this project's entries only, so a subproject's entry gets no checkbox.
        isSelectable={(entry) =>
          entry.projectId === project.id &&
          canEditTimeEntry({ entry, userId: user?.id ?? null, visible: true, canEditTimeEntries, canEditOwnTimeEntries })
        }
        bulkEditHref={canEditTimeEntries || canEditOwnTimeEntries ? `${basePath}/bulk-edit` : undefined}
      />
    </main>
  );
}

function userFilterOptions(users: { id: string; firstname: string; lastname: string }[], currentUserId: string | undefined): FilterValueOption[] {
  const options = users.map((member) => ({ value: member.id, label: `${member.lastname} ${member.firstname}` }));
  return currentUserId ? [{ value: "me", label: "<< 自分 >>" }, ...options] : options;
}
