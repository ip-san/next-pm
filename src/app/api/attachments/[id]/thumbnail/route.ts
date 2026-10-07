import { NextResponse } from "next/server";
import { isThumbnailable } from "@/domain/attachment/entity";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DEFAULT_THUMBNAIL_SIZE, generateThumbnail } from "@/infrastructure/image/thumbnail";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
import { resolveAttachmentAccess } from "@/interface/http/attachment-access";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";

export const dynamic = "force-dynamic";

/**
 * Mirrors AttachmentsController#thumbnail: 404 when the attachment has no thumbnail (not an
 * image, or no thumbnailer available) and the same read authorization as the download.
 *
 * Deliberately *not* served by `/api/attachments/[id]`: that endpoint counts downloads for
 * Files-module attachments, and an <img> on a listing page must not inflate the counter.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const attachment = await new DrizzleAttachmentRepository().findById(id);
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = (await currentUserFromAuthorizationHeader(request)) ?? (await currentUserFromCookies());
  const access = await resolveAttachmentAccess(attachment, user);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isThumbnailable(attachment)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const size = Number(new URL(request.url).searchParams.get("size") ?? DEFAULT_THUMBNAIL_SIZE);
  const thumbnail = await generateThumbnail(await new FsAttachmentStore().read(attachment.storageKey), size);
  if (!thumbnail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(thumbnail), {
    status: 200,
    headers: {
      // Always image/png: the bytes are this endpoint's own re-encoding, never the upload's.
      "Content-Type": "image/png",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      // Content-addressed by the source bytes, so a rename never serves a stale image.
      ETag: `"${attachment.digest}-${size}"`,
      "Cache-Control": "private, max-age=600",
    },
  });
}
