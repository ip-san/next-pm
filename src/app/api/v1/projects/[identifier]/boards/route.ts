import { NextResponse } from "next/server";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleBoardRepository } from "@/infrastructure/db/repositories/board-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return viaApiKey;
  return currentUserFromCookies();
}

/** Mirrors the gate on projects/[identifier]/boards/page.tsx: view_messages, nothing else. */
export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await resolveUser(request);
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_messages", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const boards = await new DrizzleBoardRepository().listByProject(project.id);
  return NextResponse.json({ boards });
}
