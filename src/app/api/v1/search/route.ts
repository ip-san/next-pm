import { NextResponse } from "next/server";
import { can } from "@/domain/authorization/authorization-service";
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

// Mirrors Redmine's search.json with the default scope=all: every project the caller may view
// is searched independently via the same searchProject() the HTML page and the per-project
// route use, so all three surfaces share one set of per-type permission gates.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const user = await resolveUser(request);

  if (query.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  const allProjects = await new DrizzleProjectRepository().listAll();
  const repositories = {
    issueRepository: new DrizzleIssueRepository(),
    wikiContentRepository: new DrizzleWikiContentRepository(),
    newsRepository: new DrizzleNewsRepository(),
    messageRepository: new DrizzleMessageRepository(),
  };

  const results = [];
  for (const project of allProjects) {
    const { actor, userGroupIds } = await resolveActor(user, project.id);
    const projectContext = toAuthorizationProject(project);
    if (!can({ permission: "view_project", project: projectContext, actor })) {
      continue;
    }

    const hits = await searchProject(repositories, {
      projectId: project.id,
      projectContext,
      actor,
      userId: user?.id ?? null,
      userGroupIds,
      issueVisibilityRoles: issuesVisibilityRoles(actor),
      query,
    });

    for (const hit of hits) {
      results.push({ ...hit, projectId: project.id, projectIdentifier: project.identifier });
    }
  }

  return NextResponse.json({ results });
}
