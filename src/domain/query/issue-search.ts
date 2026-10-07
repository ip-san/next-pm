import type { Issue } from "@/domain/issue/entity";
import type { CompiledPredicate } from "./filter-builder";
import type { SortCriterion } from "./sort";

/**
 * The private-issue rule from `domain/issue/visibility.ts`, reduced to the three facts a
 * SQL `WHERE` clause needs. Pagination has to happen in the database, so the rule cannot
 * stay a post-fetch `Array#filter` the way the old all-rows issue list applied it — see
 * `issueVisibilityScope` in interface/http/resolve-actor.ts for the actor mapping.
 *
 * The SQL form of the rule lives in `issueVisibilityClause`; the two are kept in step by
 * hand, since next-pm has no database-backed test harness to pin them together.
 */
export interface IssueVisibilityScope {
  userId: string | null;
  userGroupIds: string[];
  /** True for an admin, or for a member holding a role with issuesVisibility "all". */
  seesAllPrivateIssues: boolean;
}

export interface IssueSearchCriteria {
  projectId: string;
  predicates: CompiledPredicate[];
  visibility: IssueVisibilityScope;
  sort: SortCriterion[];
  /** A groupable column key, or null. */
  groupBy: string | null;
  /** Totalable column keys whose sums the caller wants. */
  totalableKeys: string[];
  offset: number;
  limit: number;
}

export interface IssueGroup {
  /** The raw group value — an id for association columns, the value itself otherwise. Null is Redmine's "(blank)" group. */
  value: string | null;
  count: number;
  /** Per-totalable-column sums for this group alone. */
  totals: Record<string, number>;
}

export interface IssueSearchResult {
  /** Just the issues on the requested page, already ordered. */
  issues: Issue[];
  /** Custom field values for the returned issues only, keyed `${issueId}:${customFieldId}`. */
  customValues: Map<string, string>;
  /** Summed time-entry hours per returned issue — only populated when the caller asked for the column. */
  spentHours: Map<string, number>;
  /** Count over the whole filtered set, not the page. */
  totalCount: number;
  /** Per-column sums over the whole filtered set. */
  totals: Record<string, number>;
  /** Group counts and per-group totals over the whole filtered set, or null when ungrouped. */
  groups: IssueGroup[] | null;
}

/**
 * The read model behind the issue list. Deliberately separate from `IssueRepository`: it
 * returns aggregates and a single page rather than entities, and nothing in the write path
 * should grow a dependency on it.
 */
export interface IssueSearchRepository {
  /**
   * Row count alone, so the caller can clamp the requested page before paying for the row,
   * group and total queries (Redmine's `IssueQuery#issue_count`, used the same way by
   * `IssuesController#index` to build its Paginator).
   */
  count(criteria: Omit<IssueSearchCriteria, "sort" | "groupBy" | "totalableKeys" | "offset" | "limit">): Promise<number>;
  search(criteria: IssueSearchCriteria): Promise<IssueSearchResult>;
  /**
   * Same filtering, ordering and visibility as `search`, but every matching row — for the
   * CSV/PDF exports, which Redmine caps with `Setting.issues_export_limit` rather than
   * paginating.
   */
  searchAll(criteria: Omit<IssueSearchCriteria, "offset" | "limit">, limit: number): Promise<IssueSearchResult>;
}
