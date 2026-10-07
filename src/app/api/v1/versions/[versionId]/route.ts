import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { deleteVersion, VersionNotDeletableError } from "@/application/versions/delete-version";
import { InvalidVersionError } from "@/application/versions/create-version";
import { updateVersion } from "@/application/versions/update-version";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

// Mirrors version-edit-form.tsx/page.tsx: manage_versions gates viewing and editing a version
// alike in this codebase — there's no separate view_project-gated read path for versions.
export async function GET(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const { user } = await resolveUser(request);

  const version = await new DrizzleVersionRepository().findById(versionId);
  if (!version) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const project = await new DrizzleProjectRepository().findById(version.projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_versions", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({ version });
}

const updateVersionSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  effective_date: z.string().nullable().default(null),
  status: z.enum(["open", "locked", "closed"]).default("open"),
  sharing: z.enum(["none", "descendants", "hierarchy", "tree", "system"]).default("none"),
  wiki_page_title: z.string().nullable().default(null),
});

export async function PUT(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const versionRepository = new DrizzleVersionRepository();
  const version = await versionRepository.findById(versionId);
  if (!version) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const project = await new DrizzleProjectRepository().findById(version.projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_versions", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = updateVersionSchema.safeParse((await request.json().catch(() => null))?.version);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  try {
    const updated = await updateVersion(
      { versionRepository },
      {
        versionId,
        name: parsed.data.name,
        description: parsed.data.description,
        effectiveDate: parsed.data.effective_date,
        status: parsed.data.status,
        sharing: parsed.data.sharing,
        wikiPageTitle: parsed.data.wiki_page_title,
      },
    );
    return NextResponse.json({ version: updated });
  } catch (error) {
    if (error instanceof InvalidVersionError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const versionRepository = new DrizzleVersionRepository();
  const version = await versionRepository.findById(versionId);
  if (!version) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const project = await new DrizzleProjectRepository().findById(version.projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_versions", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    await deleteVersion({ versionRepository, attachmentRepository: new DrizzleAttachmentRepository() }, versionId);
  } catch (error) {
    if (error instanceof VersionNotDeletableError) {
      return NextResponse.json({ error: "not_deletable", message: error.message }, { status: 422 });
    }
    throw error;
  }

  return new NextResponse(null, { status: 204 });
}
