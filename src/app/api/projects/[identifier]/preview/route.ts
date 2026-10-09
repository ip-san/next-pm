import { NextResponse } from "next/server";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { verifyCsrf } from "@/interface/http/csrf";
import { formattedTextHtml } from "@/interface/http/formatted-text-html";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

/** Redmine's previewing: the HTML a text will render as, in a project, for the person asking. */
const MAX_PREVIEW_LENGTH = 100_000;

/**
 * POST { text } → { html }. Judged like the page: the same references are linked, and only where the viewer may see
 * the target. A session-cookie request must pass the CSRF check; an API-key request carries no ambient credential.
 */
export async function POST(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  const user = viaApiKey ?? (await currentUserFromCookies());
  if (!viaApiKey && user && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_project", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  if (!body || typeof body.text !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 422 });
  }
  if (body.text.length > MAX_PREVIEW_LENGTH) {
    return NextResponse.json({ error: "too_long" }, { status: 413 });
  }

  const html = await formattedTextHtml(user, { id: project.id, identifier: project.identifier }, body.text);
  return NextResponse.json({ html });
}
