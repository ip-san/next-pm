import { isWithinSubtree } from "@/domain/project/nested-set";
import {
  ATTACHMENT_SEARCH_MODES,
  SEARCH_RESULT_TYPES,
  SEARCH_SCOPES,
  type AttachmentSearchMode,
  type SearchCriteria,
  type SearchResultType,
  type SearchScope,
} from "@/domain/search/entity";
import { tokenizeSearchQuery } from "@/domain/search/tokens";
import type { Project } from "@/domain/project/entity";
import type { User } from "@/domain/user/entity";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { listVisibleProjectContexts, type VisibleProjectContext } from "@/interface/http/resolve-actor";

/**
 * `Setting.search_results_per_page`'s default. next-pm has no admin setting for it yet, so
 * the Redmine default is the constant — see §13 of the parity checklist.
 */
export const SEARCH_RESULTS_PER_PAGE = 10;

export interface SearchRequest {
  question: string;
  criteria: SearchCriteria;
  /** Which object types the user ticked. Redmine reads "none ticked" as "all of them". */
  types: SearchResultType[];
  /** True when the user actually ticked boxes, so the form can render them back. */
  typesExplicit: boolean;
  openIssues: boolean;
  scope: SearchScope;
  page: number;
}

function flag(params: URLSearchParams, name: string, fallback: boolean): boolean {
  // Redmine's `params[:x] ? params[:x].present? : default` — an absent param keeps the
  // default, a present but empty one (the unchecked box's hidden input) means false.
  const raw = params.get(name);
  if (raw === null) return fallback;
  return raw.length > 0 && raw !== "0";
}

/** Reads `SearchController#index`'s params off a URL — shared by the two pages and the two REST routes. */
export function parseSearchRequest(params: URLSearchParams, defaultScope: SearchScope): SearchRequest {
  const question = (params.get("q") ?? "").trim();
  const ticked = SEARCH_RESULT_TYPES.filter((type) => params.get(type) !== null && params.get(type) !== "");
  const attachmentsRaw = params.get("attachments") ?? "0";
  const attachments: AttachmentSearchMode = ATTACHMENT_SEARCH_MODES.includes(attachmentsRaw as AttachmentSearchMode)
    ? (attachmentsRaw as AttachmentSearchMode)
    : "0";
  const scopeRaw = params.get("scope");
  const scope: SearchScope = SEARCH_SCOPES.includes(scopeRaw as SearchScope) ? (scopeRaw as SearchScope) : defaultScope;
  const page = Number(params.get("page"));

  return {
    question,
    criteria: {
      tokens: tokenizeSearchQuery(question),
      // Redmine defaults `all_words` on and `titles_only` off.
      allWords: flag(params, "all_words", true),
      titlesOnly: flag(params, "titles_only", false),
      attachments,
    },
    types: ticked.length > 0 ? ticked : [...SEARCH_RESULT_TYPES],
    typesExplicit: ticked.length > 0,
    openIssues: flag(params, "open_issues", false),
    scope,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/**
 * `SearchController#index`'s `projects_to_search` switch, narrowed to the projects the
 * viewer may actually search. Redmine builds the candidate set first and lets
 * `search_scope` intersect it with the permission; next-pm resolves the permitted set up
 * front (one actor per project) and filters it, which gives the same answer and reuses the
 * cross-project primitive the other global pages already use.
 *
 * `bookmarks` is left out: next-pm has no project bookmarks.
 */
export async function resolveSearchProjects(
  user: User | null,
  scope: SearchScope,
  currentProject: Project | null,
): Promise<VisibleProjectContext[]> {
  const permitted = await listVisibleProjectContexts(user, "search_project");

  switch (scope) {
    case "all":
      return permitted;
    case "my_projects": {
      if (!user) return [];
      const memberships = await new DrizzleMemberRepository().listByUser(user.id);
      const memberProjectIds = new Set(memberships.map((membership) => membership.projectId));
      return permitted.filter((entry) => memberProjectIds.has(entry.project.id));
    }
    case "subprojects": {
      if (!currentProject) return permitted;
      // `@project.self_and_descendants` — the nested set makes a descendant exactly a
      // project whose bounds sit inside the ancestor's.
      return permitted.filter((entry) => isWithinSubtree(currentProject, entry.project));
    }
    case "project":
      return currentProject ? permitted.filter((entry) => entry.project.id === currentProject.id) : permitted;
  }
}
