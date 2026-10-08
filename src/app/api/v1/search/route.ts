import { NextResponse } from "next/server";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { paginate, parsePagination } from "@/interface/http/pagination";
import { runSearch } from "@/interface/http/run-search";
import { parseSearchRequest, resolveSearchProjects } from "@/interface/http/search-params";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return viaApiKey;
  return currentUserFromCookies();
}

// Mirrors Redmine's search.json with the default scope=all. It reads the same option set as
// the HTML page (scope, the per-type checkboxes, titles_only, all_words, open_issues,
// attachments) and runs the same searchProject() per project, so all three surfaces share
// one set of per-type permission gates.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await resolveUser(request);
  const searchRequest = parseSearchRequest(url.searchParams, "all");

  if (searchRequest.criteria.tokens.length === 0) {
    const { limit } = parsePagination(url);
    return NextResponse.json({ results: [], total_count: 0, offset: 0, limit });
  }

  const projects = await resolveSearchProjects(user, searchRequest.scope, null);
  // The REST surface paginates with offset/limit rather than the page param, so the run
  // itself is unpaginated and `paginate` slices it.
  const run = await runSearch(projects, { ...searchRequest, page: 1 }, { userId: user?.id ?? null }, Number.MAX_SAFE_INTEGER);
  const results = run.hits.map((hit) => ({ ...hit.result, projectId: hit.project.id, projectIdentifier: hit.project.identifier }));

  const paginated = paginate(results, parsePagination(url));
  return NextResponse.json({ results: paginated.items, total_count: paginated.total_count, offset: paginated.offset, limit: paginated.limit });
}
