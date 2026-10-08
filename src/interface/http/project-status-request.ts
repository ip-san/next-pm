import { NextResponse } from "next/server";
import {
  archiveProject,
  closeProject,
  ProjectArchiveBlockedError,
  ProjectStatusChangeNotPermittedError,
  reopenProject,
  unarchiveProject,
} from "@/application/projects/project-status";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { verifyCsrf } from "@/interface/http/csrf";
import { resolveActor } from "@/interface/http/resolve-actor";

/**
 * Shared body for POST /api/v1/projects/:identifier/{archive,unarchive,close,reopen} — the
 * four endpoints Redmine added in 5.1 (`accept_api_auth ... :archive, :unarchive, :close,
 * :reopen`, routed as `match ... :via => [:post, :put]`). They take no body and answer 204,
 * matching Redmine's `render_api_ok`.
 */
export async function handleProjectStatusRequest(
  request: Request,
  identifier: string,
  transition: "archive" | "unarchive" | "close" | "reopen",
): Promise<NextResponse> {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  const user = viaApiKey ?? (await currentUserFromCookies());
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!viaApiKey && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const projectRepository = new DrizzleProjectRepository();
  const project = await projectRepository.findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    if (transition === "archive") {
      await archiveProject(
        { projectRepository, versionRepository: new DrizzleVersionRepository(), issueRepository: new DrizzleIssueRepository() },
        { projectId: project.id, isAdmin: user.isAdmin },
      );
    } else if (transition === "unarchive") {
      await unarchiveProject({ projectRepository }, { projectId: project.id, isAdmin: user.isAdmin });
    } else {
      const { actor } = await resolveActor(user, project.id);
      const change = transition === "close" ? closeProject : reopenProject;
      await change({ projectRepository }, { projectId: project.id, actor });
    }
  } catch (error) {
    if (error instanceof ProjectStatusChangeNotPermittedError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (error instanceof ProjectArchiveBlockedError) {
      // Redmine answers `render_api_errors l(:error_can_not_archive_project)`.
      return NextResponse.json({ error: "can_not_archive_project", version_ids: error.blockingVersionIds }, { status: 422 });
    }
    throw error;
  }

  return new NextResponse(null, { status: 204 });
}
