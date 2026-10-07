import type { CustomField } from "@/domain/custom-field/entity";
import type { CustomFieldRepository } from "@/domain/custom-field/repository";
import type { IssueStatusRepository } from "@/domain/issue-status/repository";
import {
  DEFAULT_ISSUE_FILTERS,
  findColumn,
  issueQueryColumns,
  resolveDisplayColumns,
  type QueryColumn,
} from "@/domain/query/columns";
import type { QueryOptions, SavedQuery } from "@/domain/query/entity";
import { compileFilters, DEFAULT_FIRST_DAY_OF_WEEK, type FilterCondition } from "@/domain/query/filter-builder";
import type { IssueSearchRepository, IssueSearchResult, IssueVisibilityScope } from "@/domain/query/issue-search";
import { paginate, resolvePerPage, type Pagination } from "@/domain/query/pagination";
import { resolveSortCriteria } from "@/domain/query/sort";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import type { SettingsRepository } from "@/domain/settings/repository";
import type { IssueListParams } from "@/interface/query/issue-query-params";

export interface ListProjectIssuesRepositories {
  issueSearchRepository: IssueSearchRepository;
  issueStatusRepository: IssueStatusRepository;
  customFieldRepository: CustomFieldRepository;
  settingsRepository: SettingsRepository;
}

export interface ListProjectIssuesInput {
  projectId: string;
  params: IssueListParams;
  /** The saved query named by `query_id`, already checked for visibility by the caller. Null for an ad-hoc list. */
  savedQuery: SavedQuery | null;
  visibility: IssueVisibilityScope;
  /** Redmine only offers the spent_hours column/total to a viewer holding view_time_entries. */
  canViewTimeEntries: boolean;
  /** "Today" for the relative date operators, as ISO yyyy-mm-dd. */
  today: string;
  /**
   * Set for an export: return every matching row up to this cap instead of one page,
   * mirroring Redmine's `Setting.issues_export_limit`. Omit for the paginated list.
   */
  exportLimit?: number;
}

export interface ListProjectIssuesResult {
  /** Everything this viewer could display, for the column chooser and filter builder. */
  availableColumns: QueryColumn[];
  /** The columns actually shown, in order. */
  displayColumns: QueryColumn[];
  /** The settings in effect, whether they came from a saved query, the URL, or the defaults. */
  effective: QueryOptions;
  customFields: CustomField[];
  search: IssueSearchResult;
  pagination: Pagination;
  perPageOptions: number[];
}

/**
 * next-pm's equivalent of `QueriesHelper#retrieve_query` + `IssuesController#index`: works
 * out which query is in effect (an explicit saved one, the URL's ad-hoc one, or the
 * default "open issues" filter), validates every column/sort/group/total name against what
 * this viewer may actually see, and asks the read model for exactly one page.
 *
 * Nothing here filters rows after the fact — visibility, filtering, ordering, grouping,
 * totals and the row count all happen in SQL, so the list stays usable with a large issue
 * count. The one in-memory step is resolving names for the page's own rows.
 */
export async function listProjectIssues(
  repositories: ListProjectIssuesRepositories,
  input: ListProjectIssuesInput,
): Promise<ListProjectIssuesResult> {
  const [statuses, allCustomFields, settings] = await Promise.all([
    repositories.issueStatusRepository.listAll(),
    repositories.customFieldRepository.listForCustomizedType("Issue"),
    loadGeneralSettings(repositories.settingsRepository),
  ]);

  const availableColumns = issueQueryColumns({
    customFields: allCustomFields,
    canViewTimeEntries: input.canViewTimeEntries,
  });

  const requested = resolveQueryOptions(input);
  const effective: QueryOptions = {
    filters: requested.filters,
    columnNames: requested.columnNames,
    groupBy: requested.groupBy && findColumn(availableColumns, requested.groupBy)?.groupable ? requested.groupBy : null,
    sortCriteria: resolveSortCriteria(availableColumns, requested.sortCriteria),
    totalableNames: requested.totalableNames.filter((key) => findColumn(availableColumns, key)?.totalable),
  };

  const displayColumns = resolveDisplayColumns(availableColumns, effective.columnNames);

  const predicates = compileFilters(effective.filters, {
    today: input.today,
    userId: input.visibility.userId,
    openStatusIds: statuses.filter((status) => !status.isClosed).map((status) => status.id),
    closedStatusIds: statuses.filter((status) => status.isClosed).map((status) => status.id),
    firstDayOfWeek: DEFAULT_FIRST_DAY_OF_WEEK,
  });

  // Group counts and totals are computed over the whole filtered set, so they're asked for
  // even on page 2 — but only for columns the viewer actually chose to total.
  const criteria = {
    projectId: input.projectId,
    predicates,
    visibility: input.visibility,
    sort: effective.sortCriteria,
    groupBy: effective.groupBy,
    totalableKeys: effective.totalableNames,
  };

  if (input.exportLimit !== undefined) {
    const search = await repositories.issueSearchRepository.searchAll(criteria, input.exportLimit);
    return {
      availableColumns,
      displayColumns,
      effective,
      customFields: allCustomFields,
      search,
      pagination: paginate(search.totalCount, Math.max(input.exportLimit, 1), "1"),
      perPageOptions: settings.perPageOptions,
    };
  }

  const perPage = resolvePerPage(settings.perPageOptions, input.params.perPage);
  // Redmine runs the count query first and clamps the page against it, so a stale ?page=99
  // link lands on the last page rather than on an empty table.
  const itemCount = await repositories.issueSearchRepository.count({
    projectId: criteria.projectId,
    predicates: criteria.predicates,
    visibility: criteria.visibility,
  });
  const pagination = paginate(itemCount, perPage, input.params.page);
  const search = await repositories.issueSearchRepository.search({
    ...criteria,
    offset: pagination.offset,
    limit: pagination.perPage,
  });

  return {
    availableColumns,
    displayColumns,
    effective,
    customFields: allCustomFields,
    search,
    pagination,
    perPageOptions: settings.perPageOptions,
  };
}

/**
 * Mirrors `retrieve_query`'s precedence: an explicit saved query wins, then the URL's own
 * `set_filter=1` params, then — for a bare /issues with no params at all — Redmine's
 * default IssueQuery, whose only filter is `status_id` with the `o` (open) operator.
 */
function resolveQueryOptions(input: ListProjectIssuesInput): QueryOptions {
  const { params, savedQuery } = input;

  if (savedQuery) {
    return {
      // A saved query's own sort/grouping can still be overridden per request, the way
      // Redmine lets `params[:sort]` win over the stored criteria.
      filters: savedQuery.filters,
      columnNames: params.columnKeys.length > 0 ? params.columnKeys : savedQuery.columnNames,
      groupBy: params.groupBy ?? savedQuery.groupBy,
      sortCriteria: params.sortCriteria.length > 0 ? params.sortCriteria : savedQuery.sortCriteria,
      totalableNames: params.totalableKeys.length > 0 ? params.totalableKeys : savedQuery.totalableNames,
    };
  }

  const filters: FilterCondition[] = params.setFilter || params.filters.length > 0 ? params.filters : DEFAULT_ISSUE_FILTERS;
  return {
    filters,
    columnNames: params.columnKeys,
    groupBy: params.groupBy,
    sortCriteria: params.sortCriteria,
    totalableNames: params.totalableKeys,
  };
}
