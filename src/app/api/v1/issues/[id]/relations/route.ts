import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { createIssueRelation, InvalidRelationError } from "@/application/issues/create-issue-relation";
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
  return { issue, project, actor, userGroupIds } as const;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await resolveUser(request);
  const loaded = await loadVisibleIssue(id, user?.id ?? null, request);
  if ("error" in loaded) return loaded.error;

  const issueRepository = new DrizzleIssueRepository();
  const relationRepository = new DrizzleIssueRelationRepository();
  const allRelations = await relationRepository.listForIssue(loaded.issue.id);

  // A relation pointing at an issue the requester can't see must not appear at all — even
  // its bare id would confirm that issue's existence. Mirrors the issue detail page's own
  // relatedIssues filtering.
  const visibilityRoles = issuesVisibilityRoles(loaded.actor);
  const relations = [];
  for (const relation of allRelations) {
    const otherId = relation.issueFromId === loaded.issue.id ? relation.issueToId : relation.issueFromId;
    const other = await issueRepository.findById(otherId);
    if (other && isPrivateIssueVisible(other, user?.id ?? null, loaded.userGroupIds, visibilityRoles)) {
      relations.push(relation);
    }
  }

  return NextResponse.json({ relations });
}

const createRelationSchema = z.object({
  issue_to_id: z.string().uuid(),
  relation_type: z.enum(["relates", "duplicates", "duplicated", "blocks", "blocked", "precedes", "follows", "copied_to", "copied_from"]),
  delay: z.number().nullable().default(null),
});

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

  if (!can({ permission: "manage_issue_relations", project: toAuthorizationProject(loaded.project), actor: loaded.actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = createRelationSchema.safeParse((await request.json().catch(() => null))?.relation);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  // Target issue must be independently visible — otherwise the relation would confirm its
  // existence and let this actor attach to it regardless of their own visibility scope.
  const targetIssue = await new DrizzleIssueRepository().findById(parsed.data.issue_to_id);
  if (!targetIssue || !isPrivateIssueVisible(targetIssue, user.id, loaded.userGroupIds, issuesVisibilityRoles(loaded.actor))) {
    return NextResponse.json({ error: "invalid_issue_to_id" }, { status: 422 });
  }

  try {
    const relation = await createIssueRelation(
      { issueRelationRepository: new DrizzleIssueRelationRepository(), issueRepository: new DrizzleIssueRepository() },
      {
        issueFromId: loaded.issue.id,
        issueToId: parsed.data.issue_to_id,
        relationType: parsed.data.relation_type,
        delay: parsed.data.delay,
      },
    );
    return NextResponse.json({ relation }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidRelationError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
