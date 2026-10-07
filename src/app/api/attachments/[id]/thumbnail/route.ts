import { NextResponse } from "next/server";
import { isThumbnailable } from "@/domain/attachment/entity";
import { resolveThumbnailSize } from "@/domain/attachment/thumbnail-input";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { generateThumbnail } from "@/infrastructure/image/thumbnail";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
import { resolveAttachmentAccess } from "@/interface/http/attachment-access";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";

export const dynamic = "force-dynamic";

/**
 * Mirrors AttachmentsController#thumbnail: 404 when the attachment has no thumbnail (not an
 * image, or no thumbnailer available) and the same read authorization as the download, which
 * is why both go through resolveAttachmentAccess rather than repeating the ladder.
 *
 * Deliberately *not* served by `/api/attachments/[id]`: that endpoint counts downloads for
 * Files-module attachments, and an <img> on a listing page must not inflate the counter.
 *
 * The response body is always this endpoint's own PNG re-encoding, never the uploaded bytes,
 * and generateThumbnail only renders formats confirmed from the bytes themselves — the stored
 * content type below is a cheap pre-filter, not the thing being trusted.
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

  const size = resolveThumbnailSize(new URL(request.url).searchParams.get("size"));
  const thumbnail = await generateThumbnail(await new FsAttachmentStore().read(attachment.storageKey), size, attachment.digest);
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
