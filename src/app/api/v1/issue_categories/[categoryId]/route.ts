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

async function loadAuthorizedCategory(categoryId: string, request: Request) {
  const categoryRepository = new DrizzleIssueCategoryRepository();
  const category = await categoryRepository.findById(categoryId);
  if (!category) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) } as const;

  const project = await new DrizzleProjectRepository().findById(category.projectId);
  if (!project) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) } as const;

  const { user } = await resolveUser(request);
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_issue_categories", project: toAuthorizationProject(project), actor })) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) } as const;
  }
  return { category, categoryRepository } as const;
}

export async function GET(request: Request, { params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const loaded = await loadAuthorizedCategory(categoryId, request);
  if ("error" in loaded) return loaded.error;
  return NextResponse.json({ issueCategory: loaded.category });
}

const updateIssueCategorySchema = z
  .object({
    name: z.string().min(1).max(30).optional(),
    assigned_to_id: z.string().uuid().nullable().optional(),
  })
  // An entirely empty body has nothing for Drizzle's `.set()` to apply — it throws
  // "No values to set" instead of a clean 422 if let through.
  .refine((value) => value.name !== undefined || value.assigned_to_id !== undefined, { message: "at least one field is required" });

export async function PUT(request: Request, { params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const loaded = await loadAuthorizedCategory(categoryId, request);
  if ("error" in loaded) return loaded.error;

  const parsed = updateIssueCategorySchema.safeParse((await request.json().catch(() => null))?.issueCategory);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  // Same FK-safety concern as create: an unvalidated bad id reaches the update as an
  // unhandled 500 (foreign key violation) rather than a clean 422.
  if (parsed.data.assigned_to_id) {
    const assignee = await new DrizzleUserRepository().findById(parsed.data.assigned_to_id);
    if (!assignee) {
      return NextResponse.json({ error: "invalid_assigned_to_id" }, { status: 422 });
    }
  }

  await loaded.categoryRepository.update(categoryId, { name: parsed.data.name, assignedToId: parsed.data.assigned_to_id });
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const loaded = await loadAuthorizedCategory(categoryId, request);
  if ("error" in loaded) return loaded.error;

  // Redmine's DELETE supports `?reassign_to_id=` to move issues to another category before
  // destroying this one; next-pm's issues.categoryId column has no FK-cascade concern to
  // resolve here (unlike Redmine's on-delete reassignment), so a plain delete matches the
  // no-reassignment path of the real endpoint (issues simply lose their category).
  await loaded.categoryRepository.delete(categoryId);
  return new NextResponse(null, { status: 204 });
}
