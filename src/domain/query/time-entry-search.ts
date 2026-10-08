import type { TimeEntry } from "@/domain/time-entry/entity";
import type { CompiledPredicate } from "./filter-builder";
import type { SortCriterion } from "./sort";

/**
 * One project's slice of a time-entry list. The SQL form of `canAccessTimeEntry`
 * (interface/http/time-entry-access.ts), which a paginated list can't apply as an
 * in-memory filter without breaking its count and totals.
 *
 * Both halves are per project because both come from the viewer's roles there:
 *   - `timeEntries` is `TimeEntry.visible_condition`'s role block — "all" sees everyone's
 *     entries, "own" only the viewer's own, "none" means no `view_time_entries` here.
 *   - `issues` is next-pm's extra narrowing: an entry attached to an issue the viewer
 *     can't see must not surface at all, since even its existence leaks that the issue
 *     was worked on. (Redmine instead shows the entry with a blank issue column; next-pm
 *     took the stricter reading and this keeps the SQL list consistent with it.)
 */
export interface ProjectTimeEntryScope {
  projectId: string;
  timeEntries: "all" | "own" | "none";
  issues: "all" | "visible_only" | "none";
}

export interface TimeEntryVisibilityScope {
  userId: string | null;
  userGroupIds: string[];
  projects: ProjectTimeEntryScope[];
}

export interface TimeEntrySearchCriteria {
  predicates: CompiledPredicate[];
  visibility: TimeEntryVisibilityScope;
  sort: SortCriterion[];
  /** A groupable column key, or null. */
  groupBy: string | null;
  /** Totalable column keys whose sums the caller wants. */
  totalableKeys: string[];
  offset: number;
  limit: number;
}

export interface TimeEntryGroup {
  /** The raw group value — an id for association columns, the value itself otherwise. Null is Redmine's "(blank)" group. */
  value: string | null;
  count: number;
  totals: Record<string, number>;
}

export interface TimeEntrySearchResult {
  entries: TimeEntry[];
  /** Custom field values for the returned entries only, keyed `${entryId}:${customFieldId}`. */
  customValues: Map<string, string>;
  totalCount: number;
  totals: Record<string, number>;
  groups: TimeEntryGroup[] | null;
}

/**
 * The read model behind both time-entry lists. Separate from `TimeEntryRepository` for the
 * same reason `IssueSearchRepository` is separate from `IssueRepository`: it returns
 * aggregates and one page, and nothing in the write path should depend on it.
 */
export interface TimeEntrySearchRepository {
  count(criteria: Pick<TimeEntrySearchCriteria, "predicates" | "visibility">): Promise<number>;
  search(criteria: TimeEntrySearchCriteria): Promise<TimeEntrySearchResult>;
  /** Same filtering and ordering, but every matching row up to `limit` — for the CSV export. */
  searchAll(criteria: Omit<TimeEntrySearchCriteria, "offset" | "limit">, limit: number): Promise<TimeEntrySearchResult>;
}
