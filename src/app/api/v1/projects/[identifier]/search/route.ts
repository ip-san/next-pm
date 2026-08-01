import { NextResponse } from "next/server";
import { searchProject } from "@/application/search/search-project";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleMessageRepository } from "@/infrastructure/db/repositories/message-repository";
import { DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWikiContentRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return viaApiKey;
  return currentUserFromCookies();
}

// Mirrors Redmine's search.json scoped to one project (SearchController#index with
// project_id) — reuses application/search/search-project.ts, the same function the HTML
// search page calls, so the REST surface and the page can never drift on which entity types
// are searched or which permission gates each one.
export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await resolveUser(request);
  const { actor, userGroupIds } = await resolveActor(user, project.id);

  const results = await searchProject(
    {
      issueRepository: new DrizzleIssueRepository(),
      wikiContentRepository: new DrizzleWikiContentRepository(),
      newsRepository: new DrizzleNewsRepository(),
      messageRepository: new DrizzleMessageRepository(),
    },
    {
      projectId: project.id,
      projectContext: toAuthorizationProject(project),
      actor,
      userId: user?.id ?? null,
      userGroupIds,
      issueVisibilityRoles: issuesVisibilityRoles(actor),
      query,
    },
  );

  return NextResponse.json({ results });
}
