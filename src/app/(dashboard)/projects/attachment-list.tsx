import type { ReactNode } from "react";
import type { Attachment } from "@/domain/attachment/entity";
import { isThumbnailable } from "@/domain/attachment/entity";

/**
 * Shared attachment list for the containers that show one (issues, documents, wiki pages).
 *
 * Images get the inline preview Redmine renders through `thumbnail_tag`: the <img> points at
 * the thumbnail endpoint, never at the download endpoint, so the original bytes are never
 * rendered as same-origin content and the Files module's download counter stays honest.
 */
export function AttachmentList({
  attachments,
  renderAction,
  emptyLabel = "添付ファイルはありません。",
}: {
  attachments: Attachment[];
  renderAction?: (attachment: Attachment) => ReactNode;
  emptyLabel?: string;
}) {
  if (attachments.length === 0) {
    return <p className="text-gray-400 text-xs">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-col gap-2 text-sm">
      {attachments.map((attachment) => (
        <li key={attachment.id} className="flex items-start gap-2">
          {isThumbnailable(attachment) ? (
            /* The thumbnail route returns a server-generated PNG of unknown intrinsic size;
               next/image would need a loader and the width/height we do not store. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/api/attachments/${attachment.id}/thumbnail?size=80`}
              alt=""
              className="w-[80px] h-auto border rounded shrink-0"
            />
          ) : null}
          <span className="flex flex-col">
            <span>
              <a href={`/api/attachments/${attachment.id}`} className="underline">
                {attachment.filename}
              </a>{" "}
              <span className="text-gray-500 text-xs">({Math.ceil(attachment.fileSize / 1024)} KB)</span>{" "}
              {renderAction ? renderAction(attachment) : null}
            </span>
            {attachment.description ? <span className="text-gray-600 text-xs">{attachment.description}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
