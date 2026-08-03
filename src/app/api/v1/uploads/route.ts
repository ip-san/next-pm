import { NextResponse } from "next/server";
import { attachmentToken } from "@/domain/attachment/entity";
import { InvalidAttachmentError } from "@/domain/attachment/validate";
import { createPendingUpload } from "@/application/attachments/upload-token";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

// Mirrors Redmine's AttachmentsController#upload (uploads.json): stores a raw-bytes body as a
// container-less attachment and returns a token ("id.digest"), to be referenced later when
// creating/updating an issue with an `uploads: [{token}]` field (see POST /api/v1/issues). Real
// Redmine also allows redeeming an upload token against wiki pages/news/documents/messages;
// this first pass only wires the issues side.
export async function POST(request: Request) {
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  // Mirrors Redmine's exact media-type gate on #upload — raw bytes only, never JSON, so a
  // client can't accidentally get its body silently parsed/discarded by a framework layer.
  const contentTypeHeader = request.headers.get("content-type") ?? "";
  if (!contentTypeHeader.startsWith("application/octet-stream")) {
    return NextResponse.json({ error: "unsupported_media_type" }, { status: 415 });
  }

  const url = new URL(request.url);
  const filename = url.searchParams.get("filename")?.trim() || `upload-${Date.now()}`;
  const contentType = url.searchParams.get("content_type")?.trim() || "";

  const data = Buffer.from(await request.arrayBuffer());

  try {
    const attachment = await createPendingUpload(
      { attachmentRepository: new DrizzleAttachmentRepository(), attachmentStorage: new FsAttachmentStore() },
      { authorId: user.id, filename, contentType, data },
    );
    return NextResponse.json({ upload: { id: attachment.id, token: attachmentToken(attachment) } }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidAttachmentError) {
      return NextResponse.json({ error: "invalid_attachment", message: error.message }, { status: 422 });
    }
    throw error;
  }
}
