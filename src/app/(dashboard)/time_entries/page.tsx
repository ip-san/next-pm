import Link from "next/link";
import { notFound } from "next/navigation";
import { listTimeEntries } from "@/application/time-entries/list-time-entries";
import { can } from "@/domain/authorization/authorization-service";
import type { SavedQuery } from "@/domain/query/entity";
import { isQueryEditable, isQueryVisible } from "@/domain/query/visibility";
import { canEditTimeEntry } from "@/domain/time-entry/visibility";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleQueryRepository } from "@/infrastructure/db/repositories/query-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTimeEntrySearchRepository } from "@/infrastructure/db/repositories/time-entry-search-repository";
import { IssueQueryForm, type FilterValueOption } from "@/interface/components/query/issue-query-form";
import { SaveQueryForm, SavedQueryControls } from "@/interface/components/query/save-query-form";
import { TimeEntryTable } from "@/interface/components/query/time-entry-table";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { loadTimeEntryLookups, resolveGlobalTimeEntryScope } from "@/interface/http/time-entry-list";
import { normalizeSearchParams, parseIssueListParams, serializeIssueListParams } from "@/interface/query/issue-query-params";
import { currentLocale } from "@/interface/http/locale";
import { localizeTimeEntryColumns } from "@/interface/query/column-labels";
import { translate } from "@/domain/i18n/messages";
import type { Locale } from "@/domain/i18n/locales";

export const dynamic = "force-dynamic";

const BASE_PATH = "/time_entries";

/**
 * `TimelogController#index` without a project (`/time_entries`). Same engine and same URL
 * contract as the project list; only the scope widens to every project the viewer holds
 * `view_time_entries` in, each still answering for itself on whose entries are visible.
 */
export default async function GlobalTimeEntriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await currentLocale();
  const listParams = parseIssueListParams(normalizeSearchParams(await searchParams));

  const user = await currentUserFromCookies();
  const scope = await resolveGlobalTimeEntryScope(user);
  if (scope.projects.length === 0) {
    // Redmine's `authorize_global` answers 403 when the permission is held nowhere; the
    // menu entry is hidden in that case too, so this is only reachable by a direct URL.
    notFound();
  }

  const allQueries = await new DrizzleQueryRepository().listAvailableFor(null, "TimeEntryQuery");
  const visibleQueries = allQueries.filter((query) => user?.isAdmin || isQueryVisible(query, user?.id ?? "", scope.roleIds));
  let savedQuery: SavedQuery | null = null;
  if (listParams.queryId) {
    savedQuery = visibleQueries.find((query) => query.id === listParams.queryId) ?? null;
  }

  const result = await listTimeEntries(
    {
      timeEntrySearchRepository: new DrizzleTimeEntrySearchRepository(),
      customFieldRepository: new DrizzleCustomFieldRepository(),
      settingsRepository: new DrizzleSettingsRepository(),
    },
    {
      params: listParams,
      savedQuery,
      visibility: scope.visibility,
      customFieldViewers: scope.customFieldViewers,
      crossProject: true,
      today: new Date().toISOString().slice(0, 10),
    },
  );

  const [lookups, activities, roles] = await Promise.all([
    loadTimeEntryLookups(scope.projects, {
      issueIds: [...new Set(result.search.entries.map((entry) => entry.issueId).filter((id): id is string => id !== null))],
      userIds: [...new Set(result.search.entries.flatMap((entry) => [entry.userId, entry.authorId]))],
    }),
    new DrizzleEnumerationRepository().listByType("TimeEntryActivity"),
    new DrizzleRoleRepository().listAssignable(),
  ]);

  // edit_time_entries / edit_own_time_entries are per project, so editability is decided
  // against the project the row belongs to rather than once for the whole list.
  const editPermissions = new Map(
    scope.projects.map((entry) => [
      entry.project.id,
      {
        canEditTimeEntries: can({ permission: "edit_time_entries", project: entry.projectContext, actor: entry.actor }),
        canEditOwnTimeEntries: can({ permission: "edit_own_time_entries", project: entry.projectContext, actor: entry.actor }),
      },
    ]),
  );

  const queryActor = { userId: user?.id ?? null, isAdmin: user?.isAdmin ?? false, canManagePublicQueries: false };
  const exportParams = serializeIssueListParams({ ...listParams, ...result.effective, page: undefined }).toString();

  const valueOptions: Record<string, FilterValueOption[]> = {
    project_id: scope.projects.map((entry) => ({ value: entry.project.id, label: entry.project.name })),
    activity_id: activities.map((activity) => ({ value: activity.id, label: activity.name })),
    user_id: userFilterOptions(locale, lookups.users, user?.id),
    author_id: userFilterOptions(locale, lookups.users, user?.id),
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
  };

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{translate(locale, "timeEntries.allTitle")}</h1>
        <a href={`/api/time_entries/csv?${exportParams}`} className="border rounded px-3 py-2 text-sm">
          CSV
        </a>
      </div>

      {visibleQueries.length > 0 && (
        <nav className="flex items-center gap-3 text-sm flex-wrap">
          <span className="text-gray-500">{translate(locale, "query.savedQueries")}</span>
          <Link href={BASE_PATH} className={!savedQuery ? "font-semibold underline" : "underline"}>
            {translate(locale, "query.noFilter")}
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
        columns={localizeTimeEntryColumns(locale, result.availableColumns)}
        locale={locale}
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
        projectIdentifier={null}
        queryType="TimeEntryQuery"
        options={result.effective}
        locale={locale}
        canPublish={user?.isAdmin ?? false}
        canSave={scope.canSaveQueries}
        roles={roles.map((role) => ({ id: role.id, name: role.name }))}
        editing={
          savedQuery && isQueryEditable(savedQuery, queryActor)
            ? { id: savedQuery.id, name: savedQuery.name, visibility: savedQuery.visibility, roleIds: savedQuery.roleIds }
            : undefined
        }
      />

      {savedQuery ? (
        <SavedQueryControls
          projectIdentifier={null}
          queryType="TimeEntryQuery"
          locale={locale}
          query={{ id: savedQuery.id, name: savedQuery.name, visibility: savedQuery.visibility, roleIds: savedQuery.roleIds }}
          canDelete={isQueryEditable(savedQuery, queryActor)}
          canCopy={scope.canSaveQueries}
        />
      ) : null}

      <TimeEntryTable
        result={result}
        lookups={lookups}
        locale={locale}
        basePath={BASE_PATH}
        listParams={listParams}
        projectIdentifierById={new Map(scope.projects.map((entry) => [entry.project.id, entry.project.identifier]))}
        isEditable={(entry) => {
          const permissions = editPermissions.get(entry.projectId);
          return (
            permissions !== undefined &&
            canEditTimeEntry({ entry, userId: user?.id ?? null, visible: true, ...permissions })
          );
        }}
      />
    </main>
  );
}

function userFilterOptions(locale: Locale, users: Map<string, string>, currentUserId: string | undefined): FilterValueOption[] {
  const options = [...users].map(([value, label]) => ({ value, label }));
  return currentUserId ? [{ value: "me", label: translate(locale, "query.me") }, ...options] : options;
}
