import { customFieldViewerFor } from "@/interface/http/custom-field-viewer";
import { customFieldChoiceOptions } from "@/domain/custom-field/choices";
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrCreateAtomKey } from "@/application/auth/get-or-create-atom-key";
import { listProjectIssues } from "@/application/issues/list-project-issues";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { subprojectIssueScope } from "@/interface/http/project-issue-scope";
import { can } from "@/domain/authorization/authorization-service";
import { memberUserIds } from "@/domain/member/entity";
import type { QueryColumn } from "@/domain/query/columns";
import type { Locale } from "@/domain/i18n/locales";
import { interpolate, translate } from "@/domain/i18n/messages";
import { currentLocale } from "@/interface/http/locale";
import { localizeColumns } from "@/interface/query/column-labels";
import type { SavedQuery } from "@/domain/query/entity";
import { linkedPages } from "@/domain/query/pagination";
import { toggleSortCriteria, sortDirectionFor } from "@/domain/query/sort";
import { isQueryEditable, isQueryVisible } from "@/domain/query/visibility";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleIssueCategoryRepository } from "@/infrastructure/db/repositories/issue-category-repository";
import { DrizzleIssueSearchRepository } from "@/infrastructure/db/repositories/issue-search-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleQueryRepository } from "@/infrastructure/db/repositories/query-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issueVisibilityScope, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { spentHoursScopeFor } from "@/interface/http/time-entry-access";
import { issueIndentLevels } from "@/domain/issue/tree";
import { IssueContextMenu } from "./issue-context-menu";
import { issueColumnValue, issueGroupLabel, issueGroupValue, type IssueListLookups } from "@/interface/query/issue-list-view";
import { issueListHref, normalizeSearchParams, parseIssueListParams, serializeIssueListParams } from "@/interface/query/issue-query-params";
import { IssueQueryForm, type FilterValueOption } from "@/interface/components/query/issue-query-form";
import { SaveQueryForm, SavedQueryControls } from "@/interface/components/query/save-query-form";

export const dynamic = "force-dynamic";

export default async function ProjectIssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { identifier } = await params;
  const locale = await currentLocale();
  const raw = normalizeSearchParams(await searchParams);
  const listParams = parseIssueListParams(raw);

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor, roleIds, userGroupIds } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "view_issues", project: projectContext, actor })) {
    notFound();
  }

  const canViewTimeEntries = can({ permission: "view_time_entries", project: projectContext, actor });
  const canSaveQueries = can({ permission: "save_queries", project: projectContext, actor });
  // Redmine's issues/index shows the import link only with both permissions (IssueImport#authorized?).
  const canImportIssues =
    can({ permission: "import_issues", project: projectContext, actor }) && can({ permission: "add_issues", project: projectContext, actor });
  const canManagePublicQueries = can({ permission: "manage_public_queries", project: projectContext, actor });
  // The context menu renders only the entries the viewer may use; bulkUpdateIssuesAction and
  // the destroy/copy pages re-check per issue regardless, so this is presentation only.
  const contextMenuPermissions = {
    edit:
      can({ permission: "edit_issues", project: projectContext, actor }) ||
      can({ permission: "edit_own_issues", project: projectContext, actor }),
    copy: can({ permission: "copy_issues", project: projectContext, actor }),
    delete: can({ permission: "delete_issues", project: projectContext, actor }),
  };

  const queryRepository = new DrizzleQueryRepository();
  const allQueries = await queryRepository.listAvailableFor(project.id, "IssueQuery");
  const visibleQueries = allQueries.filter((query) => isQueryVisible(query, user?.id ?? "", roleIds));

  // ?query_id= is client-supplied — re-verify it belongs to this project and is visible to
  // this actor before trusting its settings, rather than trusting the id alone (IDOR-safe).
  let savedQuery: SavedQuery | null = null;
  if (listParams.queryId) {
    savedQuery = visibleQueries.find((query) => query.id === listParams.queryId) ?? null;
  }

  // display_subprojects_issues: the list also covers the subprojects the viewer may see issues in.
  const { displaySubprojectsIssues } = await loadGeneralSettings(new DrizzleSettingsRepository());
  const subtree = displaySubprojectsIssues ? await subprojectIssueScope(user, project) : null;
  // Rows of a subproject link to that project's own issue page, so the project id is looked up here.
  const identifierByProjectId = subtree?.identifierByProjectId ?? new Map([[project.id, identifier]]);

  const result = await listProjectIssues(
    {
      issueSearchRepository: new DrizzleIssueSearchRepository(),
      issueStatusRepository: new DrizzleIssueStatusRepository(),
      customFieldRepository: new DrizzleCustomFieldRepository(),
      settingsRepository: new DrizzleSettingsRepository(),
    },
    {
      projectId: project.id,
      ...(subtree ? { projectScopes: subtree.projectScopes } : {}),
      customFieldViewers: subtree ? subtree.customFieldViewers : [customFieldViewerFor(user, roleIds)],
      params: listParams,
      savedQuery,
      visibility: issueVisibilityScope(user?.id ?? null, actor, userGroupIds),
      canViewTimeEntries,
      spentHoursScope: spentHoursScopeFor(actor, user?.id ?? null),
      today: new Date().toISOString().slice(0, 10),
    },
  );

  const [statuses, trackers, priorities, categories, versions, members, allGroups, roles] = await Promise.all([
    new DrizzleIssueStatusRepository().listAll(),
    new DrizzleTrackerRepository().listAll(),
    new DrizzleEnumerationRepository().listByType("IssuePriority"),
    new DrizzleIssueCategoryRepository().listByProject(project.id),
    new DrizzleVersionRepository().listByProject(project.id),
    new DrizzleMemberRepository().listByProject(project.id),
    new DrizzleGroupRepository().listAll(),
    new DrizzleRoleRepository().listAssignable(),
  ]);
  const memberUsers = await new DrizzleUserRepository().findByIds(memberUserIds(members));

  const lookups: IssueListLookups = {
    statuses: new Map(statuses.map((status) => [status.id, status.name])),
    trackers: new Map(trackers.map((tracker) => [tracker.id, tracker.name])),
    priorities: new Map(priorities.map((priority) => [priority.id, priority.name])),
    users: new Map(memberUsers.map((member) => [member.id, `${member.lastname} ${member.firstname}`])),
    groups: new Map(allGroups.map((group) => [group.id, group.name])),
    categories: new Map(categories.map((category) => [category.id, category.name])),
    versions: new Map(versions.map((version) => [version.id, version.name])),
  };
  const rowContext = { locale, lookups, customValues: result.search.customValues, spentHours: result.search.spentHours };

  const basePath = `/projects/${identifier}/issues`;
  const exportParams = serializeIssueListParams({ ...listParams, ...result.effective, page: undefined }).toString();
  // The feed URL has to carry its own credential: a feed reader sends no session cookie.
  const atomKey = user ? await getOrCreateAtomKey(new DrizzleUserRepository(), user.id) : null;

  const valueOptions: Record<string, FilterValueOption[]> = {
    status_id: statuses.map((status) => ({ value: status.id, label: status.name })),
    tracker_id: trackers.map((tracker) => ({ value: tracker.id, label: tracker.name })),
    priority_id: priorities.map((priority) => ({ value: priority.id, label: priority.name })),
    category_id: categories.map((category) => ({ value: category.id, label: category.name })),
    fixed_version_id: versions.map((version) => ({ value: version.id, label: version.name })),
    // Redmine offers "me" as the first value of any user filter (`Query#statement` swaps it
    // for the current user's id at compile time).
    author_id: userFilterOptions(locale, memberUsers, user?.id),
    assigned_to_id: userFilterOptions(locale, memberUsers, user?.id),
    is_private: [
      { value: "1", label: translate(locale, "query.yes") },
      { value: "0", label: translate(locale, "query.no") },
    ],
    ...Object.fromEntries(
      result.customFields
        .filter((field) => field.fieldFormat === "list" || field.fieldFormat === "bool")
        .map((field) => [
          `cf_${field.id}`,
          field.fieldFormat === "bool"
            ? [
                { value: "1", label: translate(locale, "query.yes") },
                { value: "0", label: translate(locale, "query.no") },
              ]
            : field.possibleValues.map((value) => ({ value, label: value })),
        ]),
    ),
    // A user or version field filters by one of the project's members or shared versions.
    ...Object.fromEntries(
      Object.entries(
        customFieldChoiceOptions(result.customFields, {
          users: memberUsers.map((member) => ({ value: member.id, label: `${member.lastname} ${member.firstname}` })),
          versions: versions.map((version) => ({ value: version.id, label: version.name })),
        }),
      ).map(([fieldId, options]) => [`cf_${fieldId}`, options]),
    ),
  };

  const columns = localizeColumns(locale, result.availableColumns);
  const displayColumns = result.displayColumns.map((column) => columns.find((candidate) => candidate.key === column.key) ?? column);
  const groupsByValue = new Map((result.search.groups ?? []).map((group) => [group.value, group]));
  const totalColumns = result.effective.totalableNames
    .map((key) => columns.find((column) => column.key === key))
    .filter((column): column is QueryColumn => column !== undefined);

  // Group boundaries are worked out before rendering rather than with a running variable
  // inside the row map — the rows arrive already ordered by the group column, so a row
  // starts a new group whenever its group value differs from the previous row's.
  // Subtask indentation, Redmine's issue_list helper: relative to the issues actually in
  // this list, so a child whose parent is filtered out or on another page stays flush left.
  const indentLevels = issueIndentLevels(
    result.search.issues,
    new Map(result.search.issues.map((issue) => [issue.id, issue.parentId])),
  );

  const groupBy = result.effective.groupBy;
  const tableRows = result.search.issues.map((issue, index) => {
    const groupValue = groupBy ? issueGroupValue(groupBy, issue, result.search.customValues) : undefined;
    const previous = index === 0 ? undefined : result.search.issues[index - 1];
    const previousValue = groupBy && previous ? issueGroupValue(groupBy, previous, result.search.customValues) : undefined;
    return {
      issue,
      groupValue,
      startsGroup: groupValue !== undefined && (index === 0 || groupValue !== previousValue),
    };
  });

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{project.name} — {translate(locale, "issues.title")}</h1>
        <div className="flex items-center gap-2">
          <Link href="/my" className="border rounded px-3 py-2 text-sm">
            {translate(locale, "my.title")}
          </Link>
          <Link href={`/projects/${identifier}/reports`} className="border rounded px-3 py-2 text-sm">
            {translate(locale, "issues.report")}
          </Link>
          <Link href={`/projects/${identifier}/gantt`} className="border rounded px-3 py-2 text-sm">
            {translate(locale, "projectMenu.gantt")}
          </Link>
          <Link href={`/projects/${identifier}/calendar`} className="border rounded px-3 py-2 text-sm">
            {translate(locale, "projectMenu.calendar")}
          </Link>
          <a href={`/api/projects/${identifier}/issues/csv?${exportParams}`} className="border rounded px-3 py-2 text-sm">
            CSV
          </a>
          <a href={`/api/projects/${identifier}/issues/pdf?${exportParams}`} className="border rounded px-3 py-2 text-sm">
            PDF
          </a>
          <a
            href={`/api/projects/${identifier}/issues/atom?${exportParams}${atomKey ? `&key=${atomKey}` : ""}`}
            className="border rounded px-3 py-2 text-sm"
          >
            Atom
          </a>
          {canImportIssues ? (
            <Link href={`/projects/${identifier}/issues/import`} className="border rounded px-3 py-2 text-sm">
              {translate(locale, "issues.importCsv")}
            </Link>
          ) : null}
          <Link href={`/projects/${identifier}/issues/new`} className="bg-black text-white rounded px-3 py-2 text-sm">
            {translate(locale, "issues.new")}
          </Link>
        </div>
      </div>

      {visibleQueries.length > 0 && (
        <nav className="flex items-center gap-3 text-sm flex-wrap">
          <span className="text-gray-500">{translate(locale, "query.savedQueries")}</span>
          <Link href={basePath} className={!savedQuery ? "font-semibold underline" : "underline"}>
            {translate(locale, "query.noFilter")}
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
        columns={columns}
        locale={locale}
        valueOptions={valueOptions}
        initialFilters={result.effective.filters}
        initialColumnKeys={displayColumns.filter((column) => !column.frozen).map((column) => column.key)}
        initialGroupBy={result.effective.groupBy}
        initialTotalableKeys={result.effective.totalableNames}
        sortCriteria={result.effective.sortCriteria}
        perPage={String(result.pagination.perPage)}
        queryId={savedQuery?.id}
      />

      <SaveQueryForm
        projectIdentifier={identifier}
        queryType="IssueQuery"
        options={result.effective}
        locale={locale}
        canPublish={canManagePublicQueries}
        canSave={canSaveQueries}
        roles={roles.map((role) => ({ id: role.id, name: role.name }))}
        editing={
          savedQuery && isQueryEditable(savedQuery, { userId: user?.id ?? null, isAdmin: user?.isAdmin ?? false, canManagePublicQueries })
            ? { id: savedQuery.id, name: savedQuery.name, visibility: savedQuery.visibility, roleIds: savedQuery.roleIds }
            : undefined
        }
      />

      {savedQuery ? (
        <SavedQueryControls
          projectIdentifier={identifier}
          queryType="IssueQuery"
          query={{ id: savedQuery.id, name: savedQuery.name, visibility: savedQuery.visibility, roleIds: savedQuery.roleIds }}
          canDelete={isQueryEditable(savedQuery, {
            userId: user?.id ?? null,
            isAdmin: user?.isAdmin ?? false,
            canManagePublicQueries,
          })}
          canCopy={canSaveQueries}
          locale={locale}
        />
      ) : null}

      <form method="get" action={`${basePath}/bulk-edit`} className="flex flex-col gap-3">
        <p className="text-sm text-gray-600">
          {interpolate(translate(locale, "issues.showing"), { total: result.pagination.itemCount, first: result.pagination.firstItem, last: result.pagination.lastItem })}
        </p>

        <IssueContextMenu
          projectIdentifier={identifier}
          basePath={basePath}
          statuses={statuses.map((status) => ({ id: status.id, name: status.name }))}
          trackers={trackers.map((tracker) => ({ id: tracker.id, name: tracker.name }))}
          priorities={priorities.map((priority) => ({ id: priority.id, name: priority.name }))}
          assignees={[
            ...memberUsers.map((member) => ({ id: member.id, name: `${member.lastname} ${member.firstname}` })),
            ...allGroups.map((group) => ({ id: `group:${group.id}`, name: interpolate(translate(locale, "issues.groupName"), { name: group.name }) })),
          ]}
          versions={versions.map((version) => ({ id: version.id, name: version.name }))}
          permissions={contextMenuPermissions}
          locale={locale}
        />
        <table className="text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="pr-4 py-1" />
              {displayColumns.map((column) => (
                <th key={column.key} className="pr-4 py-1">
                  {column.sortable ? (
                    <Link
                      href={issueListHref(basePath, listParams, {
                        ...result.effective,
                        columnKeys: result.effective.columnNames,
                        totalableKeys: result.effective.totalableNames,
                        sortCriteria: toggleSortCriteria(result.effective.sortCriteria, column),
                        page: undefined,
                      })}
                      className="underline"
                    >
                      {column.label}
                      {sortDirectionFor(result.effective.sortCriteria, column.key) === "asc" ? " ▲" : null}
                      {sortDirectionFor(result.effective.sortCriteria, column.key) === "desc" ? " ▼" : null}
                    </Link>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map(({ issue, groupValue, startsGroup }) => {
              // Group counts and totals come from the aggregate query over the *whole*
              // filtered set, so a group header shows its real size even when the page cuts
              // the group in half.
              const group = startsGroup ? groupsByValue.get(groupValue ?? null) : undefined;

              return (
                <Fragment key={issue.id}>
                  {startsGroup ? (
                    <tr className="bg-gray-50 border-b">
                      <td colSpan={displayColumns.length + 1} className="py-1 font-semibold">
                        {issueGroupLabel(groupBy as string, groupValue ?? null, lookups, locale)} ({group?.count ?? 0})
                        {totalColumns.map((column) => (
                          <span key={column.key} className="ml-3 font-normal text-gray-600">
                            {column.label}: {group?.totals[column.key] ?? 0}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ) : null}
                  <tr className="border-b" {...(issue.projectId === project.id ? { "data-issue-id": issue.id } : {})}>
                    <td className="pr-4 py-1">
                      {issue.projectId === project.id ? (
                        <input type="checkbox" name="ids" value={issue.id} aria-label={interpolate(translate(locale, "issues.selectIssue"), { subject: issue.subject })} />
                      ) : null}
                    </td>
                    {displayColumns.map((column) => (
                      <td key={column.key} className="pr-4 py-1">
                        {column.key === "id" || column.key === "subject" ? (
                          <Link
                            href={`/projects/${identifierByProjectId.get(issue.projectId) ?? identifier}/issues/${issue.id}`}
                            className="underline"
                            style={
                              column.key === "subject" ? { marginLeft: `${(indentLevels.get(issue.id) ?? 0) * 1.25}rem` } : undefined
                            }
                          >
                            {issueColumnValue(column, issue, rowContext)}
                          </Link>
                        ) : (
                          issueColumnValue(column, issue, rowContext)
                        )}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
          {totalColumns.length > 0 ? (
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td className="pr-4 py-1">{translate(locale, "query.totals")}</td>
                {displayColumns.map((column) => (
                  <td key={column.key} className="pr-4 py-1">
                    {column.totalable && result.effective.totalableNames.includes(column.key)
                      ? (result.search.totals[column.key] ?? 0)
                      : null}
                  </td>
                ))}
              </tr>
              {/* Totals for columns that aren't displayed still have to appear somewhere. */}
              {totalColumns.some((column) => !displayColumns.includes(column)) ? (
                <tr>
                  <td colSpan={displayColumns.length + 1} className="py-1 text-gray-600 font-normal">
                    {totalColumns
                      .filter((column) => !displayColumns.includes(column))
                      .map((column) => `${column.label}: ${result.search.totals[column.key] ?? 0}`)
                      .join(" / ")}
                  </td>
                </tr>
              ) : null}
            </tfoot>
          ) : null}
        </table>
        <button type="submit" className="border rounded px-3 py-2 text-sm self-start">
          {translate(locale, "issues.editSelected")}
        </button>
      </form>

      <nav className="flex items-center gap-3 text-sm flex-wrap" aria-label={translate(locale, "query.pagination")}>
        {linkedPages(result.pagination).map((page) => (
          <Link
            key={page}
            href={issueListHref(basePath, listParams, {
              ...result.effective,
              columnKeys: result.effective.columnNames,
              totalableKeys: result.effective.totalableNames,
              page: String(page),
              perPage: String(result.pagination.perPage),
            })}
            className={page === result.pagination.page ? "font-semibold" : "underline"}
          >
            {page}
          </Link>
        ))}
        <span className="text-gray-500">{translate(locale, "query.perPage")}</span>
        {result.perPageOptions.map((option) => (
          <Link
            key={option}
            href={issueListHref(basePath, listParams, {
              ...result.effective,
              columnKeys: result.effective.columnNames,
              totalableKeys: result.effective.totalableNames,
              page: undefined,
              perPage: String(option),
            })}
            className={option === result.pagination.perPage ? "font-semibold" : "underline"}
          >
            {option}
          </Link>
        ))}
      </nav>
    </main>
  );
}

function userFilterOptions(locale: Locale, users: { id: string; firstname: string; lastname: string }[], currentUserId: string | undefined): FilterValueOption[] {
  const options = users.map((member) => ({ value: member.id, label: `${member.lastname} ${member.firstname}` }));
  return currentUserId ? [{ value: "me", label: translate(locale, "query.me") }, ...options] : options;
}
