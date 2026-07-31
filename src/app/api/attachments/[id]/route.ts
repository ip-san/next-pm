import { NextResponse } from "next/server";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleDocumentRepository } from "@/infrastructure/db/repositories/document-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const attachment = await new DrizzleAttachmentRepository().findById(id);
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await currentUserFromCookies();

  if (attachment.containerType === "Issue") {
    const issue = await new DrizzleIssueRepository().findById(attachment.containerId);
    if (!issue) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const project = await new DrizzleProjectRepository().findById(issue.projectId);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { actor } = await resolveActor(user, project.id);
    if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!isPrivateIssueVisible(issue, user?.id ?? null, issuesVisibilityRoles(actor))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  } else if (attachment.containerType === "Document") {
    const document = await new DrizzleDocumentRepository().findById(attachment.containerId);
    if (!document) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const project = await new DrizzleProjectRepository().findById(document.projectId);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { actor } = await resolveActor(user, project.id);
    if (!can({ permission: "view_documents", project: toAuthorizationProject(project), actor })) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  } else {
    // Message/News attachments are not exposed via the UI yet — deny access rather than
    // guess at their visibility rules.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = await new FsAttachmentStore().read(attachment.storageKey);

  // Always force a download (never inline-render) so a maliciously-typed upload (HTML/SVG with
  // embedded script) can't execute as same-origin content — this is the primary XSS defense here,
  // not the Content-Type header.
  const asciiFilename = attachment.filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": attachment.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      "Content-Length": String(attachment.fileSize),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
