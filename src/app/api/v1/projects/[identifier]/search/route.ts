import { NextResponse } from "next/server";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { paginate, parsePagination } from "@/interface/http/pagination";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { runSearch } from "@/interface/http/run-search";
import { parseSearchRequest, resolveSearchProjects } from "@/interface/http/search-params";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return viaApiKey;
  return currentUserFromCookies();
}

// Mirrors Redmine's search.json scoped to one project (SearchController#index with
// project_id) — same option parsing and same searchProject() as the HTML page, so the REST
// surface and the page can never drift on which entity types are searched or which
// permission gates each one. ?scope=subprojects widens to the project's descendants.
export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const url = new URL(request.url);

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await resolveUser(request);
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "search_project", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const searchRequest = parseSearchRequest(url.searchParams, "project");
  if (searchRequest.criteria.tokens.length === 0) {
    const { limit } = parsePagination(url);
    return NextResponse.json({ results: [], total_count: 0, offset: 0, limit });
  }

  const projects = await resolveSearchProjects(user, searchRequest.scope, project);
  const run = await runSearch(projects, { ...searchRequest, page: 1 }, { userId: user?.id ?? null }, Number.MAX_SAFE_INTEGER);
  const results = run.hits.map((hit) => ({ ...hit.result, projectId: hit.project.id, projectIdentifier: hit.project.identifier }));

  const paginated = paginate(results, parsePagination(url));
  return NextResponse.json({ results: paginated.items, total_count: paginated.total_count, offset: paginated.offset, limit: paginated.limit });
}
