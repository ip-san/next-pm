import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

async function loadVisibleIssue(id: string, userId: string | null, request: Request) {
  const issue = await new DrizzleIssueRepository().findById(id);
  if (!issue) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) } as const;

  const project = await new DrizzleProjectRepository().findById(issue.projectId);
  if (!project) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) } as const;

  const { user } = await resolveUser(request);
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) } as const;
  }
  if (!isPrivateIssueVisible(issue, userId, userGroupIds, issuesVisibilityRoles(actor))) {
    return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) } as const;
  }
  return { issue, project, actor } as const;
}

const addWatcherSchema = z.object({
  user_id: z.string().uuid(),
});

// Mirrors Redmine's issues/:issue_id/watchers.json#create: the actor needs add_issue_watchers,
// and the target must be a project member (Redmine's Principal.assignable_watchers) — not an
// arbitrary user id — same rule as the addIssueWatcherAction server action.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const loaded = await loadVisibleIssue(id, user.id, request);
  if ("error" in loaded) return loaded.error;

  if (!can({ permission: "add_issue_watchers", project: toAuthorizationProject(loaded.project), actor: loaded.actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = addWatcherSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  const targetMember = await new DrizzleMemberRepository().findByUserAndProject(parsed.data.user_id, loaded.project.id);
  if (!targetMember) {
    return NextResponse.json({ error: "invalid_user_id" }, { status: 422 });
  }

  await new DrizzleWatcherRepository().watch("Issue", loaded.issue.id, parsed.data.user_id);
  return new NextResponse(null, { status: 204 });
}
