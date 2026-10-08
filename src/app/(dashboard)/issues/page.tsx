import { Fragment } from "react";
import Link from "next/link";
import { listProjectIssues } from "@/application/issues/list-project-issues";
import type { QueryColumn } from "@/domain/query/columns";
import type { SavedQuery } from "@/domain/query/entity";
import { linkedPages } from "@/domain/query/pagination";
import { sortDirectionFor, toggleSortCriteria } from "@/domain/query/sort";
import { isQueryEditable, isQueryVisible } from "@/domain/query/visibility";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleIssueSearchRepository } from "@/infrastructure/db/repositories/issue-search-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleQueryRepository } from "@/infrastructure/db/repositories/query-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { IssueQueryForm, type FilterValueOption } from "@/interface/components/query/issue-query-form";
import { SaveQueryForm, SavedQueryControls } from "@/interface/components/query/save-query-form";
import { getOrCreateAtomKey } from "@/application/auth/get-or-create-atom-key";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { loadGlobalIssueLookups, resolveGlobalIssueListScope } from "@/interface/http/global-issue-list";
import { issueColumnValue, issueGroupLabel, issueGroupValue } from "@/interface/query/issue-list-view";
import { issueListHref, normalizeSearchParams, parseIssueListParams, serializeIssueListParams } from "@/interface/query/issue-query-params";

export const dynamic = "force-dynamic";

const BASE_PATH = "/issues";

/**
 * Redmine's `IssuesController#index` without a project (`/issues`). The same query engine
 * as the project list, scoped to every project the viewer holds `view_issues` in rather
 * than to one — so the private-issue rule, the `spent_hours` reach and the saved queries on
 * offer are all resolved per project and then combined, never averaged.
 */
export default async function GlobalIssuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = normalizeSearchParams(await searchParams);
  const listParams = parseIssueListParams(raw);

  const user = await currentUserFromCookies();
  const scope = await resolveGlobalIssueListScope(user);

  // Redmine's saved-query sidebar on a global list offers only the global queries
  // (`Query.global_or_on_project(nil)`). Visibility still needs the viewer's roles, which
  // are per project, so the union across visible projects is what "holds this role" means
  // on a page that spans all of them.
  const allQueries = await new DrizzleQueryRepository().listAvailableFor(null, "IssueQuery");
  const visibleQueries = allQueries.filter((query) => user?.isAdmin || isQueryVisible(query, user?.id ?? "", scope.roleIds));

  // ?query_id= is client-supplied — re-verify it is one of the queries this actor may see
  // before trusting its settings (IDOR-safe), exactly as the project list does.
  let savedQuery: SavedQuery | null = null;
  if (listParams.queryId) {
    savedQuery = visibleQueries.find((query) => query.id === listParams.queryId) ?? null;
  }

  const result = await listProjectIssues(
    {
      issueSearchRepository: new DrizzleIssueSearchRepository(),
      issueStatusRepository: new DrizzleIssueStatusRepository(),
      customFieldRepository: new DrizzleCustomFieldRepository(),
      settingsRepository: new DrizzleSettingsRepository(),
    },
    {
      projectId: null,
      projectScopes: scope.projectScopes,
      customFieldViewers: scope.customFieldViewers,
      params: listParams,
      savedQuery,
      // `seesAllPrivateIssues` is decided per project inside `projectScopes`; only the
      // identity half of the rule is shared across them.
      visibility: { userId: user?.id ?? null, userGroupIds: scope.userGroupIds, seesAllPrivateIssues: false },
      canViewTimeEntries: scope.canViewTimeEntries,
      // Unused on this path: every project's reach comes from its own `projectScopes` entry.
      spentHoursScope: { kind: "own", userId: user?.id ?? null },
      today: new Date().toISOString().slice(0, 10),
    },
  );

  const [lookups, roles] = await Promise.all([loadGlobalIssueLookups(scope.projects), new DrizzleRoleRepository().listAssignable()]);
  const rowContext = { lookups, customValues: result.search.customValues, spentHours: result.search.spentHours };
  const projectIdentifierById = new Map(scope.projects.map((entry) => [entry.project.id, entry.project.identifier]));

  const atomKey = user ? await getOrCreateAtomKey(new DrizzleUserRepository(), user.id) : null;
  const exportParams = serializeIssueListParams({ ...listParams, ...result.effective, page: undefined }).toString();

  const valueOptions: Record<string, FilterValueOption[]> = {
    project_id: scope.projects.map((entry) => ({ value: entry.project.id, label: entry.project.name })),
    status_id: [...lookups.statuses].map(([value, label]) => ({ value, label })),
    tracker_id: [...lookups.trackers].map(([value, label]) => ({ value, label })),
    priority_id: [...lookups.priorities].map(([value, label]) => ({ value, label })),
    fixed_version_id: [...lookups.versions].map(([value, label]) => ({ value, label })),
    author_id: userFilterOptions(lookups.users, user?.id),
    assigned_to_id: userFilterOptions(lookups.users, user?.id),
    is_private: [
      { value: "1", label: "はい" },
      { value: "0", label: "いいえ" },
    ],
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

  const groupsByValue = new Map((result.search.groups ?? []).map((group) => [group.value, group]));
  const totalColumns = result.effective.totalableNames
    .map((key) => result.availableColumns.find((column) => column.key === key))
    .filter((column): column is QueryColumn => column !== undefined);

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

  const issueHref = (issue: { id: string; projectId: string }): string =>
    `/projects/${projectIdentifierById.get(issue.projectId) ?? ""}/issues/${issue.id}`;

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">チケット（全プロジェクト）</h1>
        <div className="flex items-center gap-2">
          <a href={`/api/issues/csv?${exportParams}`} className="border rounded px-3 py-2 text-sm">
            CSV
          </a>
          <a href={`/api/issues/atom?${exportParams}${atomKey ? `&key=${atomKey}` : ""}`} className="border rounded px-3 py-2 text-sm">
            Atom
          </a>
        </div>
      </div>

      {visibleQueries.length > 0 && (
        <nav className="flex items-center gap-3 text-sm flex-wrap">
          <span className="text-gray-500">保存済みクエリ:</span>
          <Link href={BASE_PATH} className={!savedQuery ? "font-semibold underline" : "underline"}>
            (絞り込みなし)
          </Link>
          {visibleQueries.map((query) => (
            <Link
              key={query.id}
              href={`${BASE_PATH}?query_id=${query.id}`}
              className={savedQuery?.id === query.id ? "font-semibold underline" : "underline"}
            >
              {query.name}
            </Link>
          ))}
        </nav>
      )}

      <IssueQueryForm
        action={BASE_PATH}
        columns={result.availableColumns}
        valueOptions={valueOptions}
        initialFilters={result.effective.filters}
        initialColumnKeys={result.displayColumns.filter((column) => !column.frozen).map((column) => column.key)}
        initialGroupBy={result.effective.groupBy}
        initialTotalableKeys={result.effective.totalableNames}
        sortCriteria={result.effective.sortCriteria}
        perPage={String(result.pagination.perPage)}
        queryId={savedQuery?.id}
      />

      <SaveQueryForm
        projectIdentifier={null}
        queryType="IssueQuery"
        options={result.effective}
        // A *global* public query is admin-only in Redmine, since
        // `allowed_to?(:manage_public_queries, nil)` is false for everyone else.
        canPublish={user?.isAdmin ?? false}
        canSave={scope.canSaveQueries}
        roles={roles.map((role) => ({ id: role.id, name: role.name }))}
        editing={
          savedQuery &&
          isQueryEditable(savedQuery, { userId: user?.id ?? null, isAdmin: user?.isAdmin ?? false, canManagePublicQueries: false })
            ? { id: savedQuery.id, name: savedQuery.name, visibility: savedQuery.visibility, roleIds: savedQuery.roleIds }
            : undefined
        }
      />

      {savedQuery ? (
        <SavedQueryControls
          projectIdentifier={null}
          queryType="IssueQuery"
          query={{ id: savedQuery.id, name: savedQuery.name, visibility: savedQuery.visibility, roleIds: savedQuery.roleIds }}
          canDelete={isQueryEditable(savedQuery, {
            userId: user?.id ?? null,
            isAdmin: user?.isAdmin ?? false,
            canManagePublicQueries: false,
          })}
          canCopy={scope.canSaveQueries}
        />
      ) : null}

      <p className="text-sm text-gray-600">
        {result.pagination.itemCount}件中 {result.pagination.firstItem}–{result.pagination.lastItem}件を表示
      </p>

      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            {result.displayColumns.map((column) => (
              <th key={column.key} className="pr-4 py-1">
                {column.sortable ? (
                  <Link
                    href={issueListHref(BASE_PATH, listParams, {
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
            const group = startsGroup ? groupsByValue.get(groupValue ?? null) : undefined;
            return (
              <Fragment key={issue.id}>
                {startsGroup ? (
                  <tr className="bg-gray-50 border-b">
                    <td colSpan={result.displayColumns.length} className="py-1 font-semibold">
                      {issueGroupLabel(groupBy as string, groupValue ?? null, lookups)} ({group?.count ?? 0})
                      {totalColumns.map((column) => (
                        <span key={column.key} className="ml-3 font-normal text-gray-600">
                          {column.label}: {group?.totals[column.key] ?? 0}
                        </span>
                      ))}
                    </td>
                  </tr>
                ) : null}
                <tr className="border-b">
                  {result.displayColumns.map((column) => (
                    <td key={column.key} className="pr-4 py-1">
                      {column.key === "id" || column.key === "subject" ? (
                        <Link href={issueHref(issue)} className="underline">
                          {issueColumnValue(column, issue, rowContext)}
                        </Link>
                      ) : column.key === "project" ? (
                        <Link href={`/projects/${projectIdentifierById.get(issue.projectId) ?? ""}/issues`} className="underline">
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
              {result.displayColumns.map((column, index) => (
                <td key={column.key} className="pr-4 py-1">
                  {index === 0 ? "合計" : null}
                  {column.totalable && result.effective.totalableNames.includes(column.key)
                    ? (result.search.totals[column.key] ?? 0)
                    : null}
                </td>
              ))}
            </tr>
            {totalColumns.some((column) => !result.displayColumns.includes(column)) ? (
              <tr>
                <td colSpan={result.displayColumns.length} className="py-1 text-gray-600 font-normal">
                  {totalColumns
                    .filter((column) => !result.displayColumns.includes(column))
                    .map((column) => `${column.label}: ${result.search.totals[column.key] ?? 0}`)
                    .join(" / ")}
                </td>
              </tr>
            ) : null}
          </tfoot>
        ) : null}
      </table>

      <nav className="flex items-center gap-3 text-sm flex-wrap" aria-label="ページ送り">
        {linkedPages(result.pagination).map((page) => (
          <Link
            key={page}
            href={issueListHref(BASE_PATH, listParams, {
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
        <span className="text-gray-500">表示件数:</span>
        {result.perPageOptions.map((option) => (
          <Link
            key={option}
            href={issueListHref(BASE_PATH, listParams, {
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

function userFilterOptions(users: Map<string, string>, currentUserId: string | undefined): FilterValueOption[] {
  const options = [...users].map(([value, label]) => ({ value, label }));
  return currentUserId ? [{ value: "me", label: "<< 自分 >>" }, ...options] : options;
}
