import { NextResponse } from "next/server";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleDocumentRepository } from "@/infrastructure/db/repositories/document-repository";
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

export async function DELETE(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const documentRepository = new DrizzleDocumentRepository();
  const document = await documentRepository.findById(documentId);
  if (!document) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const project = await new DrizzleProjectRepository().findById(document.projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "delete_documents", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await documentRepository.delete(documentId);
  return new NextResponse(null, { status: 204 });
}
