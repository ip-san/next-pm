import { NextResponse } from "next/server";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { DrizzleIssueRelationRepository } from "@/infrastructure/db/repositories/issue-relation-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const relationRepository = new DrizzleIssueRelationRepository();
  const relation = await relationRepository.findById(id);
  if (!relation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Re-derive the owning project/actor from the "from" issue — never trust anything about
  // the relation row itself for authorization beyond which issue it's attached to.
  const issueRepository = new DrizzleIssueRepository();
  const issue = await issueRepository.findById(relation.issueFromId);
  if (!issue) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const project = await new DrizzleProjectRepository().findById(issue.projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!isPrivateIssueVisible(issue, user.id, issuesVisibilityRoles(actor))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!can({ permission: "manage_issue_relations", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await relationRepository.delete(relation.id);
  return new NextResponse(null, { status: 204 });
}
