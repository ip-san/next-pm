import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { createDocument, InvalidDocumentError } from "@/application/documents/create-document";
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

/** Mirrors the gate on projects/[identifier]/documents/page.tsx: view_documents, nothing else. */
export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { user } = await resolveUser(request);
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_documents", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const documents = await new DrizzleDocumentRepository().listByProject(project.id);
  return NextResponse.json({ documents });
}

const createDocumentSchema = z.object({
  category_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().default(""),
});

export async function POST(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "add_documents", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = createDocumentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  try {
    const document = await createDocument(
      { documentRepository: new DrizzleDocumentRepository() },
      { projectId: project.id, categoryId: parsed.data.category_id, title: parsed.data.title, description: parsed.data.description },
    );
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidDocumentError) {
      return NextResponse.json({ error: "invalid_document", message: error.message }, { status: 422 });
    }
    throw error;
  }
}
