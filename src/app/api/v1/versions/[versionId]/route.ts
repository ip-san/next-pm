import { NextResponse } from "next/server";
import { can } from "@/domain/authorization/authorization-service";
import { deleteVersion, VersionNotDeletableError } from "@/application/versions/delete-version";
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
    await deleteVersion({ versionRepository }, versionId);
  } catch (error) {
    if (error instanceof VersionNotDeletableError) {
      return NextResponse.json({ error: "not_deletable", message: error.message }, { status: 422 });
    }
    throw error;
  }

  return new NextResponse(null, { status: 204 });
}
