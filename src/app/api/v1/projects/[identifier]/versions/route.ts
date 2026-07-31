import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { createVersion, InvalidVersionError } from "@/application/versions/create-version";
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

/** Mirrors the gate on projects/[identifier]/versions/page.tsx: view_issues, nothing else. */
export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { user } = await resolveUser(request);
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const versions = await new DrizzleVersionRepository().listByProject(project.id);
  return NextResponse.json({ versions });
}

const createVersionSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  effective_date: z.string().nullable().default(null),
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
  if (!can({ permission: "manage_versions", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = createVersionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  try {
    const version = await createVersion(
      { versionRepository: new DrizzleVersionRepository() },
      { projectId: project.id, name: parsed.data.name, description: parsed.data.description, effectiveDate: parsed.data.effective_date, wikiPageTitle: null },
    );
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidVersionError) {
      return NextResponse.json({ error: "invalid_version", message: error.message }, { status: 422 });
    }
    throw error;
  }
}
