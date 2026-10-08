import type { QueryVisibility } from "@/domain/query/entity";
import { compileFilters, DEFAULT_FIRST_DAY_OF_WEEK, type FilterCondition } from "@/domain/query/filter-builder";
import { normalizeSortCriteria, type SortCriterion } from "@/domain/query/sort";

export class InvalidQueryError extends Error {}
export class QueryPermissionError extends Error {}

/** Everything a Query's create/edit form submits. */
export interface QuerySettings {
  name: string;
  visibility: QueryVisibility;
  roleIds: string[];
  filters: FilterCondition[];
  columnNames: string[];
  groupBy: string | null;
  sortCriteria: SortCriterion[];
  totalableNames: string[];
}

/** The permission facts every saved-query use case needs about the caller. */
export interface QueryActor {
  userId: string;
  isAdmin: boolean;
  /** Redmine's `save_queries` (`:require => :loggedin`) — needed to create or edit any query. */
  canSaveQueries: boolean;
  /** Redmine's `manage_public_queries` (`:require => :member`) — needed for a public/roles query. */
  canManagePublicQueries: boolean;
}

/**
 * Validates a submitted query and applies Redmine's visibility rule from
 * `QueriesController#update_query_from_params`: a caller without `manage_public_queries`
 * doesn't get an error for asking to publish, their query is silently forced back to
 * private. The same branch is what stops a non-admin from ever owning a *global* public
 * query, since `allowed_to?(:manage_public_queries, nil)` is false for non-admins.
 */
export function normalizeQuerySettings(settings: QuerySettings, actor: QueryActor, projectId: string | null): QuerySettings {
  const name = settings.name.trim();
  if (name.length === 0 || name.length > 255) {
    throw new InvalidQueryError("クエリ名は1〜255文字で入力してください。");
  }

  const mayPublish = actor.isAdmin || (projectId !== null && actor.canManagePublicQueries);
  const visibility: QueryVisibility = mayPublish ? settings.visibility : "private";

  if (visibility === "roles" && settings.roleIds.length === 0) {
    // Mirrors Query's `errors.add(:base, ...) if visibility == VISIBILITY_ROLES && roles.blank?`.
    throw new InvalidQueryError("ロールを指定するクエリでは、1つ以上のロールを選んでください。");
  }

  try {
    // Compilation is the validation: an operator/value combination the engine can't express
    // must be rejected at save time rather than blowing up every later page render.
    compileFilters(settings.filters, {
      today: new Date().toISOString().slice(0, 10),
      userId: actor.userId,
      openStatusIds: [],
      closedStatusIds: [],
      firstDayOfWeek: DEFAULT_FIRST_DAY_OF_WEEK,
    });
  } catch {
    throw new InvalidQueryError("フィルタの内容が不正です。");
  }

  return {
    name,
    visibility,
    roleIds: visibility === "roles" ? settings.roleIds : [],
    filters: settings.filters,
    columnNames: settings.columnNames,
    groupBy: settings.groupBy,
    sortCriteria: normalizeSortCriteria(settings.sortCriteria),
    totalableNames: settings.totalableNames,
  };
}

/**
 * Redmine's `save_queries` gate on QueriesController's new/create/edit/update/destroy.
 * `editable_by?` (domain/query/visibility.ts) is the *other* half, checked per existing
 * query; this one covers "may this user author queries at all".
 */
export function assertCanSaveQueries(actor: QueryActor): void {
  if (!actor.isAdmin && !actor.canSaveQueries) {
    throw new QueryPermissionError("クエリを保存する権限がありません。");
  }
}
