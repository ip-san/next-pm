import { NextResponse } from "next/server";
import { z } from "zod";
import { PROJECT_MODULES } from "@/domain/authorization/permission-registry";
import { can } from "@/domain/authorization/authorization-service";
import { deleteProject, DeleteProjectNotPermittedError } from "@/application/projects/delete-project";
import { updateProject, UpdateProjectNotPermittedError } from "@/application/projects/update-project";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
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
  enabled_modules: z.array(z.enum(PROJECT_MODULES)).default([]),
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

  const parsed = updateProjectSchema.safeParse((await request.json().catch(() => null))?.project);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  // edit_project, and the separate select_project_publicity / select_project_modules rules,
  // are enforced inside the use case against the project it loads itself.
  let updated;
  try {
    updated = await updateProject(
      projectRepository,
      project.id,
      {
        name: parsed.data.name,
        description: parsed.data.description,
        isPublic: parsed.data.is_public,
        enabledModules: parsed.data.enabled_modules,
        trackerIds: parsed.data.tracker_ids,
      },
      { actor },
    );
  } catch (error) {
    if (error instanceof UpdateProjectNotPermittedError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw error;
  }

  return NextResponse.json({ project: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
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
  try {
    await deleteProject(
      { projectRepository, attachmentStorage: new FsAttachmentStore() },
      {
        projectId: project.id,
        actor,
        isAdmin: user.isAdmin,
        // Redmine skips the typed confirmation for API requests
        // (`api_request? || params[:confirm] == identifier`).
        confirmIdentifier: project.identifier,
      },
    );
  } catch (error) {
    if (error instanceof DeleteProjectNotPermittedError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw error;
  }

  return new NextResponse(null, { status: 204 });
}
