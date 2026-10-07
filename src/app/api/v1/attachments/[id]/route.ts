import { NextResponse } from "next/server";
import { z } from "zod";
import type { Attachment } from "@/domain/attachment/entity";
import { isThumbnailable } from "@/domain/attachment/entity";
import { InvalidAttachmentError } from "@/domain/attachment/validate";
import { updateAttachmentMetadata } from "@/application/attachments/update-attachment-metadata";
import { journalizeAttachment } from "@/application/issues/journalize-attachment";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
import { resolveAttachmentAccess } from "@/interface/http/attachment-access";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

function serialize(attachment: Attachment) {
  return {
    id: attachment.id,
    filename: attachment.filename,
    filesize: attachment.fileSize,
    content_type: attachment.contentType,
    description: attachment.description,
    content_url: `/api/attachments/${attachment.id}`,
    thumbnail_url: isThumbnailable(attachment) ? `/api/attachments/${attachment.id}/thumbnail` : null,
    digest: attachment.digest,
    downloads: attachment.downloads,
    author_id: attachment.authorId,
    container_type: attachment.containerType,
    container_id: attachment.containerId,
    created_on: attachment.createdAt.toISOString(),
  };
}

/** Mirrors GET /attachments/:id.json — metadata only; the bytes stay on /api/attachments/:id. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await resolveUser(request);

  const attachment = await new DrizzleAttachmentRepository().findById(id);
  if (!attachment) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!(await resolveAttachmentAccess(attachment, user))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ attachment: serialize(attachment) });
}

const updateAttachmentSchema = z.object({
  filename: z.string().optional(),
  description: z.string().optional(),
});

/** Mirrors PATCH/PUT /attachments/:id.json with Attachment's safe_attributes. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const attachmentRepository = new DrizzleAttachmentRepository();
  const attachment = await attachmentRepository.findById(id);
  if (!attachment) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const access = await resolveAttachmentAccess(attachment, user);
  if (!access) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!access.allows("edit")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = updateAttachmentSchema.safeParse((await request.json().catch(() => null))?.attachment);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  try {
    const updated = await updateAttachmentMetadata({ attachmentRepository }, { attachmentId: attachment.id, ...parsed.data });
    return NextResponse.json({ attachment: serialize(updated) });
  } catch (error) {
    if (error instanceof InvalidAttachmentError) {
      return NextResponse.json({ error: "invalid_attachment", message: error.message }, { status: 422 });
    }
    throw error;
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return PATCH(request, context);
}

/** Mirrors DELETE /attachments/:id.json (AttachmentsController#destroy). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const attachmentRepository = new DrizzleAttachmentRepository();
  const attachment = await attachmentRepository.findById(id);
  if (!attachment) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const access = await resolveAttachmentAccess(attachment, user);
  if (!access) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!access.allows("delete")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await attachmentRepository.delete(attachment.id);
  await new FsAttachmentStore().delete(attachment.storageKey);

  // Same Issue#attachment_removed history entry the UI delete writes.
  if (attachment.containerType === "Issue" && attachment.containerId) {
    await journalizeAttachment(
      { journalRepository: new DrizzleJournalRepository() },
      { issueId: attachment.containerId, userId: user.id, attachment, change: "removed" },
    );
  }

  return new NextResponse(null, { status: 204 });
}
