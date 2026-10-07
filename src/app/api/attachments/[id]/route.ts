import { NextResponse } from "next/server";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
import { resolveAttachmentAccess } from "@/interface/http/attachment-access";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const attachmentRepository = new DrizzleAttachmentRepository();
  const attachment = await attachmentRepository.findById(id);
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Redmine's `accept_api_auth :show, :download, :thumbnail` — an API client downloads the
  // same bytes the browser does.
  const user = (await currentUserFromAuthorizationHeader(request)) ?? (await currentUserFromCookies());
  const access = await resolveAttachmentAccess(attachment, user);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Mirrors AttachmentsController#download: only the Files module's containers keep a
  // download counter — issue/wiki/document attachments do not.
  if (attachment.containerType === "Project" || attachment.containerType === "Version") {
    await attachmentRepository.incrementDownloads(attachment.id);
  }

  const data = await new FsAttachmentStore().read(attachment.storageKey);

  // Always force a download (never inline-render) so a maliciously-typed upload (HTML/SVG with
  // embedded script) can't execute as same-origin content — this is the primary XSS defense here,
  // not the Content-Type header. Images get an inline preview through the thumbnail endpoint,
  // which re-encodes the bytes instead of echoing them back.
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
