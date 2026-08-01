import { NextResponse } from "next/server";
import { can } from "@/domain/authorization/authorization-service";
import { ArchiveBlockedError, archiveProject, unarchiveProject } from "@/application/projects/archive-project";
import { closeProject, reopenProject } from "@/application/projects/close-project";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { verifyCsrf } from "@/interface/http/csrf";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

/**
 * Shared controller for POST /api/v1/projects/:identifier/{close,reopen,archive,unarchive}
 * — Redmine's accept_api_auth lifecycle actions. close/reopen need close_project;
 * archive/unarchive are admin-only (require_admin), NOT authorization-service checks:
 * `can` denies everything on an archived project, the very state unarchive manages.
 */
export async function handleProjectLifecycle(
  request: Request,
  params: Promise<{ identifier: string }>,
  action: "close" | "reopen" | "archive" | "unarchive",
): Promise<NextResponse> {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  const user = viaApiKey ?? (await currentUserFromCookies());
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!viaApiKey && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const { identifier } = await params;
  const projectRepository = new DrizzleProjectRepository();
  const project = await projectRepository.findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (action === "archive" || action === "unarchive") {
    if (!user.isAdmin) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (action === "archive") {
      try {
        await archiveProject(projectRepository, new DrizzleVersionRepository(), new DrizzleIssueRepository(), project.id);
      } catch (error) {
        if (error instanceof ArchiveBlockedError) {
          return NextResponse.json({ error: "archive_blocked", message: error.message }, { status: 422 });
        }
        throw error;
      }
    } else {
      await unarchiveProject(projectRepository, project.id);
    }
    return new NextResponse(null, { status: 204 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "close_project", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await (action === "close" ? closeProject : reopenProject)(projectRepository, project.id);
  return new NextResponse(null, { status: 204 });
}
