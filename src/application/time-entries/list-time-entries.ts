import type { CustomField } from "@/domain/custom-field/entity";
import type { CustomFieldRepository } from "@/domain/custom-field/repository";
import { findColumn, resolveDisplayColumns, type QueryColumn } from "@/domain/query/columns";
import type { QueryOptions, SavedQuery } from "@/domain/query/entity";
import { compileFilters, DEFAULT_FIRST_DAY_OF_WEEK, type FilterCondition } from "@/domain/query/filter-builder";
import { paginate, resolvePerPage, type Pagination } from "@/domain/query/pagination";
import { resolveSortCriteria } from "@/domain/query/sort";
import {
  DEFAULT_GLOBAL_TIME_ENTRY_COLUMN_KEYS,
  DEFAULT_TIME_ENTRY_COLUMN_KEYS,
  DEFAULT_TIME_ENTRY_FILTERS,
  DEFAULT_TIME_ENTRY_SORT,
  DEFAULT_TIME_ENTRY_TOTALABLE_KEYS,
  timeEntryQueryColumns,
} from "@/domain/query/time-entry-columns";
import type {
  TimeEntrySearchRepository,
  TimeEntrySearchResult,
  TimeEntryVisibilityScope,
} from "@/domain/query/time-entry-search";
import { validFilters } from "@/domain/query/validate-filters";
import type { SettingsRepository } from "@/domain/settings/repository";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import type { IssueListParams } from "@/interface/query/issue-query-params";

export interface ListTimeEntriesRepositories {
  timeEntrySearchRepository: TimeEntrySearchRepository;
  customFieldRepository: CustomFieldRepository;
  settingsRepository: SettingsRepository;
}

export interface ListTimeEntriesInput {
  params: IssueListParams;
  /** The saved query named by `query_id`, already checked for visibility by the caller. Null for an ad-hoc list. */
  savedQuery: SavedQuery | null;
  /** Which projects' entries the viewer may see, and how far each reaches. */
  visibility: TimeEntryVisibilityScope;
  /** Set on the cross-project list: adds the project column and its filter, as `if project.nil?` does in Redmine. */
  crossProject: boolean;
  /** "Today" for the relative date operators, as ISO yyyy-mm-dd. */
  today: string;
  /** Set for an export: return every matching row up to this cap instead of one page. */
  exportLimit?: number;
}

export interface ListTimeEntriesResult {
  availableColumns: QueryColumn[];
  displayColumns: QueryColumn[];
  effective: QueryOptions;
  customFields: CustomField[];
  search: TimeEntrySearchResult;
  pagination: Pagination;
  perPageOptions: number[];
}

/**
 * `TimelogController#index` plus `retrieve_query(TimeEntryQuery)`: works out which query is
 * in effect (an explicit saved one, the URL's ad-hoc one, or TimeEntryQuery's own defaults),
 * validates every column/sort/group/total name, and asks the read model for one page.
 *
 * Deliberately a sibling of `listProjectIssues` rather than a generalisation of it: the two
 * share the URL contract, the filter compiler, the pagination and the validation, but their
 * column catalogs, defaults and read models are different enough that one parameterised use
 * case would be a switch statement in a trench coat.
 */
export async function listTimeEntries(
  repositories: ListTimeEntriesRepositories,
  input: ListTimeEntriesInput,
): Promise<ListTimeEntriesResult> {
  const [allCustomFields, settings] = await Promise.all([
    repositories.customFieldRepository.listForCustomizedType("TimeEntry"),
    loadGeneralSettings(repositories.settingsRepository),
  ]);

  const availableColumns = timeEntryQueryColumns({ customFields: allCustomFields, crossProject: input.crossProject });
  const requested = resolveQueryOptions(input);
  const effective: QueryOptions = {
    filters: validFilters(availableColumns, requested.filters),
    columnNames: requested.columnNames,
    groupBy: requested.groupBy && findColumn(availableColumns, requested.groupBy)?.groupable ? requested.groupBy : null,
    sortCriteria: resolveSortCriteria(availableColumns, requested.sortCriteria, DEFAULT_TIME_ENTRY_SORT),
    totalableNames: requested.totalableNames.filter((key) => findColumn(availableColumns, key)?.totalable),
  };

  const displayColumns = resolveDisplayColumns(
    availableColumns,
    effective.columnNames,
    input.crossProject ? DEFAULT_GLOBAL_TIME_ENTRY_COLUMN_KEYS : DEFAULT_TIME_ENTRY_COLUMN_KEYS,
  );

  const predicates = compileFilters(effective.filters, {
    today: input.today,
    userId: input.visibility.userId,
    // Time-entry filters never reach a status column, so the open/closed sets stay empty.
    openStatusIds: [],
    closedStatusIds: [],
    firstDayOfWeek: DEFAULT_FIRST_DAY_OF_WEEK,
  });

  const criteria = {
    predicates,
    visibility: input.visibility,
    sort: effective.sortCriteria,
    groupBy: effective.groupBy,
    totalableKeys: effective.totalableNames,
  };

  if (input.exportLimit !== undefined) {
    const search = await repositories.timeEntrySearchRepository.searchAll(criteria, input.exportLimit);
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
  const itemCount = await repositories.timeEntrySearchRepository.count({ predicates, visibility: input.visibility });
  const pagination = paginate(itemCount, perPage, input.params.page);
  const search = await repositories.timeEntrySearchRepository.search({
    ...criteria,
    offset: pagination.offset,
    limit: pagination.perPage,
  });

  return { availableColumns, displayColumns, effective, customFields: allCustomFields, search, pagination, perPageOptions: settings.perPageOptions };
}

/** `retrieve_query`'s precedence, with TimeEntryQuery's own defaults at the end. */
function resolveQueryOptions(input: ListTimeEntriesInput): QueryOptions {
  const { params, savedQuery } = input;

  if (savedQuery) {
    if (params.setFilter) {
      return {
        filters: params.filters,
        columnNames: params.columnKeys,
        groupBy: params.groupBy,
        sortCriteria: params.sortCriteria,
        totalableNames: params.totalableKeys,
      };
    }
    return {
      filters: savedQuery.filters,
      columnNames: savedQuery.columnNames,
      groupBy: savedQuery.groupBy,
      sortCriteria: params.sortCriteria.length > 0 ? params.sortCriteria : savedQuery.sortCriteria,
      totalableNames: savedQuery.totalableNames,
    };
  }

  const filters: FilterCondition[] = params.setFilter || params.filters.length > 0 ? params.filters : DEFAULT_TIME_ENTRY_FILTERS;
  return {
    filters,
    columnNames: params.columnKeys,
    groupBy: params.groupBy,
    sortCriteria: params.sortCriteria,
    // A bare list shows the hours total, as `Setting.time_entry_list_defaults` asks.
    totalableNames: params.setFilter ? params.totalableKeys : (params.totalableKeys.length > 0 ? params.totalableKeys : DEFAULT_TIME_ENTRY_TOTALABLE_KEYS),
  };
}
