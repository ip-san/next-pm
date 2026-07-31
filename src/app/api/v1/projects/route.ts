import { NextResponse } from "next/server";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return viaApiKey;
  return currentUserFromCookies();
}

/**
 * Mirrors Project.visible_condition (public, or the actor is a member/admin) by reusing the
 * same can({permission: "view_project"}) check every other read path already goes through,
 * rather than re-deriving a separate "visible projects" query.
 */
export async function GET(request: Request) {
  const user = await resolveUser(request);
  const allProjects = await new DrizzleProjectRepository().listAll();

  const visible = [];
  for (const project of allProjects) {
    const { actor } = await resolveActor(user, project.id);
    if (can({ permission: "view_project", project: toAuthorizationProject(project), actor })) {
      visible.push(project);
    }
  }

  return NextResponse.json({ projects: visible });
}
