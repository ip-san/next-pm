import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { updateProject } from "@/application/projects/update-project";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

const AVAILABLE_MODULES = ["issue_tracking", "time_tracking", "wiki", "boards", "news", "documents", "files", "repository"] as const;

export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { user } = await resolveUser(request);
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_project", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({ project });
}

const updateProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  is_public: z.boolean().default(false),
  enabled_modules: z.array(z.enum(AVAILABLE_MODULES)).default([]),
  tracker_ids: z.array(z.string().uuid()).default([]),
});

export async function PUT(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const projectRepository = new DrizzleProjectRepository();
  const project = await projectRepository.findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "edit_project", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = updateProjectSchema.safeParse((await request.json().catch(() => null))?.project);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  const updated = await updateProject(projectRepository, project.id, {
    name: parsed.data.name,
    description: parsed.data.description,
    isPublic: parsed.data.is_public,
    enabledModules: parsed.data.enabled_modules,
    trackerIds: parsed.data.tracker_ids,
  });

  return NextResponse.json({ project: updated });
}
