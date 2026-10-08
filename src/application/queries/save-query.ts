import type { QueryType, SavedQuery } from "@/domain/query/entity";
import type { QueryRepository } from "@/domain/query/repository";
import { assertCanSaveQueries, normalizeQuerySettings, type QueryActor, type QuerySettings } from "./query-settings";

export interface SaveQueryInput {
  /** Null for a global (cross-project) query, mirroring Redmine's `query_is_for_all`. */
  projectId: string | null;
  type: QueryType;
  settings: QuerySettings;
  actor: QueryActor;
}

/** Creates a new saved query owned by the actor (Redmine's QueriesController#create). */
export async function saveQuery(
  repositories: { queryRepository: QueryRepository },
  input: SaveQueryInput,
): Promise<SavedQuery> {
  assertCanSaveQueries(input.actor);
  const settings = normalizeQuerySettings(input.settings, input.actor, input.projectId);

  return repositories.queryRepository.create({
    name: settings.name,
    type: input.type,
    projectId: input.projectId,
    userId: input.actor.userId,
    visibility: settings.visibility,
    filters: settings.filters,
    columnNames: settings.columnNames,
    groupBy: settings.groupBy,
    sortCriteria: settings.sortCriteria,
    totalableNames: settings.totalableNames,
    roleIds: settings.roleIds,
  });
}
