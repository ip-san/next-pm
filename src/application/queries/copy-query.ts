import type { SavedQuery } from "@/domain/query/entity";
import type { QueryRepository } from "@/domain/query/repository";
import { isQueryVisible } from "@/domain/query/visibility";
import { assertCanSaveQueries, normalizeQuerySettings, type QueryActor } from "./query-settings";
import { QueryNotFoundError } from "./update-query";

export interface CopyQueryInput {
  queryId: string;
  /** Null for the global list — a global request may only copy a global query. */
  projectId: string | null;
  /** The copy's name. */
  name: string;
  actor: QueryActor;
  /** The actor's roles on the project, for the source query's visibility check. */
  actorRoleIds: string[];
}

/**
 * Redmine has no dedicated copy action — its "copy" link is `queries/new` prefilled from an
 * existing query, so the rules are the ones for *creating*: the source only has to be
 * visible (not editable), and the copy is owned by whoever made it. The copy starts private
 * unless the actor may publish, which `normalizeQuerySettings` enforces; carrying the
 * source's visibility over unchecked would let a viewer clone someone else's public query
 * into a second public one without `manage_public_queries`.
 */
export async function copyQuery(
  repositories: { queryRepository: QueryRepository },
  input: CopyQueryInput,
): Promise<SavedQuery> {
  assertCanSaveQueries(input.actor);

  const source = await repositories.queryRepository.findById(input.queryId);
  if (!source || source.projectId !== input.projectId || !isQueryVisible(source, input.actor.userId, input.actorRoleIds)) {
    throw new QueryNotFoundError("クエリが見つかりません。");
  }

  const settings = normalizeQuerySettings(
    {
      name: input.name,
      visibility: source.visibility,
      roleIds: source.roleIds,
      filters: source.filters,
      columnNames: source.columnNames,
      groupBy: source.groupBy,
      sortCriteria: source.sortCriteria,
      totalableNames: source.totalableNames,
    },
    input.actor,
    source.projectId,
  );

  return repositories.queryRepository.create({
    name: settings.name,
    type: source.type,
    projectId: source.projectId,
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
