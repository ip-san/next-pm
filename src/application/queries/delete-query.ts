import type { QueryRepository } from "@/domain/query/repository";
import { isQueryEditable } from "@/domain/query/visibility";
import { QueryPermissionError, type QueryActor } from "./query-settings";
import { QueryNotFoundError } from "./update-query";

export interface DeleteQueryInput {
  queryId: string;
  projectId: string;
  actor: QueryActor;
}

/** Redmine's QueriesController#destroy — gated by the same `editable_by?` as #update. */
export async function deleteQuery(
  repositories: { queryRepository: QueryRepository },
  input: DeleteQueryInput,
): Promise<void> {
  const query = await repositories.queryRepository.findById(input.queryId);
  if (!query || query.projectId !== input.projectId) {
    throw new QueryNotFoundError("クエリが見つかりません。");
  }
  if (!isQueryEditable(query, input.actor)) {
    throw new QueryPermissionError("このクエリを削除する権限がありません。");
  }

  await repositories.queryRepository.delete(query.id);
}
