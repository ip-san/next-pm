import type { SavedQuery } from "@/domain/query/entity";
import type { QueryRepository } from "@/domain/query/repository";
import { isQueryEditable } from "@/domain/query/visibility";
import { normalizeQuerySettings, QueryPermissionError, type QueryActor, type QuerySettings } from "./query-settings";

export class QueryNotFoundError extends Error {}

export interface UpdateQueryInput {
  queryId: string;
  /** The project the request came through — guards against editing another project's query by id. Null for the global list, which may only touch global queries. */
  projectId: string | null;
  settings: QuerySettings;
  actor: QueryActor;
}

/**
 * Redmine's QueriesController#update. Note that it runs *no* `save_queries` check of its
 * own: `find_query` gates purely on `editable_by?`, so someone who already owns a private
 * query can keep editing it even after the permission is taken away. Faithfully ported —
 * taking save_queries away is meant to stop new queries appearing, not to strand the ones
 * a user already has.
 */
export async function updateQuery(
  repositories: { queryRepository: QueryRepository },
  input: UpdateQueryInput,
): Promise<SavedQuery> {
  const query = await repositories.queryRepository.findById(input.queryId);
  if (!query || query.projectId !== input.projectId) {
    throw new QueryNotFoundError("クエリが見つかりません。");
  }
  if (!isQueryEditable(query, input.actor)) {
    throw new QueryPermissionError("このクエリを編集する権限がありません。");
  }

  const settings = normalizeQuerySettings(input.settings, input.actor, query.projectId);

  return repositories.queryRepository.update(query.id, {
    name: settings.name,
    projectId: query.projectId,
    visibility: settings.visibility,
    filters: settings.filters,
    columnNames: settings.columnNames,
    groupBy: settings.groupBy,
    sortCriteria: settings.sortCriteria,
    totalableNames: settings.totalableNames,
    roleIds: settings.roleIds,
  });
}
