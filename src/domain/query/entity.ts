import type { FilterCondition } from "./filter-builder";
import type { SortCriterion } from "./sort";

export type QueryVisibility = "private" | "roles" | "public";

/**
 * Mirrors Redmine's STI `type` column. Only IssueQuery is implemented; TimeEntryQuery is
 * declared so the global /time_entries list can reuse this table and these rules later.
 */
export type QueryType = "IssueQuery" | "TimeEntryQuery";

export interface SavedQuery {
  id: string;
  name: string;
  type: QueryType;
  projectId: string | null;
  userId: string;
  visibility: QueryVisibility;
  filters: FilterCondition[];
  /** Redmine's `column_names`. Empty means "use the default column set". */
  columnNames: string[];
  /** Redmine's `group_by`. */
  groupBy: string | null;
  /** Redmine's `sort_criteria`. */
  sortCriteria: SortCriterion[];
  /** Redmine's `options[:totalable_names]`. */
  totalableNames: string[];
  /** Only meaningful when visibility is "roles". */
  roleIds: string[];
}

/** A query's display settings without the identity/ownership half — what the list UI builds from a URL. */
export type QueryOptions = Pick<SavedQuery, "filters" | "columnNames" | "groupBy" | "sortCriteria" | "totalableNames">;
