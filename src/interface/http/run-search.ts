import { searchProject } from "@/application/search/search-project";
import type { SearchResult, SearchResultType } from "@/domain/search/entity";
import { SEARCH_RESULT_TYPES } from "@/domain/search/entity";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleMessageRepository } from "@/infrastructure/db/repositories/message-repository";
import { DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleWikiContentRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { issuesVisibilityRoles, type VisibleProjectContext } from "@/interface/http/resolve-actor";
import type { SearchRequest } from "@/interface/http/search-params";

export interface SearchHit {
  project: { id: string; identifier: string; name: string };
  result: SearchResult;
}

export interface SearchRun {
  /** The page of hits the caller asked for, newest first. */
  hits: SearchHit[];
  /** Every matching hit's count, so the pager and the per-type checkboxes can be rendered. */
  totalCount: number;
  countsByType: Record<SearchResultType, number>;
  pageCount: number;
}

function emptyCounts(): Record<SearchResultType, number> {
  return { issue: 0, wiki_page: 0, news: 0, message: 0 };
}

/**
 * Runs `searchProject` over each project in scope and merges the results the way
 * `Redmine::Search::Fetcher` does: ranked by the type's date column descending, counted per
 * type, then paginated by `Setting.search_results_per_page`.
 *
 * The per-project loop is not an optimisation target: every object type is gated by its own
 * `view_*` permission in that project, and `search_project` itself is per project too, so
 * there is no single query that could answer this without re-deriving all of it.
 */
export async function runSearch(
  projects: VisibleProjectContext[],
  request: SearchRequest,
  viewer: { userId: string | null },
  perPage: number,
): Promise<SearchRun> {
  if (request.criteria.tokens.length === 0) {
    return { hits: [], totalCount: 0, countsByType: emptyCounts(), pageCount: 0 };
  }

  const repositories = {
    issueRepository: new DrizzleIssueRepository(),
    wikiContentRepository: new DrizzleWikiContentRepository(),
    newsRepository: new DrizzleNewsRepository(),
    messageRepository: new DrizzleMessageRepository(),
  };

  const perProject = await Promise.all(
    projects.map(async (entry) => {
      const results = await searchProject(repositories, {
        projectId: entry.project.id,
        projectContext: entry.projectContext,
        actor: entry.actor,
        userId: viewer.userId,
        userGroupIds: entry.userGroupIds,
        issueVisibilityRoles: issuesVisibilityRoles(entry.actor),
        criteria: request.criteria,
        types: request.types,
        openIssues: request.openIssues,
      });
      return results.map((result) => ({
        project: { id: entry.project.id, identifier: entry.project.identifier, name: entry.project.name },
        result,
      }));
    }),
  );

  const all = perProject.flat().sort((a, b) => b.result.occurredAt.getTime() - a.result.occurredAt.getTime());

  const countsByType = emptyCounts();
  for (const hit of all) {
    countsByType[hit.result.type] += 1;
  }
  // The checkbox counts are "how many of this type match", so a type the user unticked
  // still reports zero rather than a stale number — same as Redmine, which only counts
  // the types in the current scope.
  for (const type of SEARCH_RESULT_TYPES) {
    if (!request.types.includes(type)) countsByType[type] = 0;
  }

  const pageCount = Math.max(1, Math.ceil(all.length / perPage));
  const page = Math.min(request.page, pageCount);
  return {
    hits: all.slice((page - 1) * perPage, page * perPage),
    totalCount: all.length,
    countsByType,
    pageCount,
  };
}
