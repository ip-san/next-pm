import { NextResponse } from "next/server";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject, visibleIssueFilter } from "@/interface/http/resolve-actor";

const RESULT_LIMIT = 10;

// Backs the parent-issue and issue-relation pickers — mirrors Redmine's
// IssuesController#auto_complete.json (search by subject, capped result count, same
// view_issues + private-issue visibility gating as every other issue-bearing read path).
export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (query.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const matches = await new DrizzleIssueRepository().search(project.id, query);
  const visible = matches.filter(visibleIssueFilter(user?.id ?? null, actor)).slice(0, RESULT_LIMIT);

  return NextResponse.json({ results: visible.map((issue) => ({ id: issue.id, subject: issue.subject })) });
}
