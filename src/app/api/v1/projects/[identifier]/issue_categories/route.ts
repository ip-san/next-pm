import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleIssueCategoryRepository } from "@/infrastructure/db/repositories/issue-category-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

// Mirrors Redmine's issue_categories.json: IssueCategoriesController#index/#create are both
// gated on manage_categories (next-pm's manage_issue_categories) — a management permission,
// not just view_issues, matching this codebase's memberships.json precedent.
export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { user } = await resolveUser(request);
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_issue_categories", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const issueCategories = await new DrizzleIssueCategoryRepository().listByProject(project.id);
  return NextResponse.json({ issueCategories });
}

const createIssueCategorySchema = z.object({
  name: z.string().min(1).max(30),
  assigned_to_id: z.string().uuid().nullable().default(null),
});

export async function POST(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_issue_categories", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = createIssueCategorySchema.safeParse((await request.json().catch(() => null))?.issueCategory);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  // assignedToId is a real FK to users — an unvalidated bad id would otherwise reach the
  // insert and fail as an unhandled 500 (foreign key violation) instead of a clean 422.
  if (parsed.data.assigned_to_id !== null) {
    const assignee = await new DrizzleUserRepository().findById(parsed.data.assigned_to_id);
    if (!assignee) {
      return NextResponse.json({ error: "invalid_assigned_to_id" }, { status: 422 });
    }
  }

  const issueCategory = await new DrizzleIssueCategoryRepository().create({
    projectId: project.id,
    name: parsed.data.name,
    assignedToId: parsed.data.assigned_to_id,
  });
  return NextResponse.json({ issueCategory }, { status: 201 });
}
