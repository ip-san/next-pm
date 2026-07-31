"use client";

import { useActionState } from "react";
import { deleteDocumentAttachmentAction, type DeleteDocumentAttachmentActionState } from "@/interface/actions/document-actions";

const initialState: DeleteDocumentAttachmentActionState = { error: null };

export function DeleteDocumentAttachmentButton({ projectIdentifier, attachmentId }: { projectIdentifier: string; attachmentId: string }) {
  const [state, formAction, pending] = useActionState(deleteDocumentAttachmentAction, initialState);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="attachmentId" value={attachmentId} />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="text-xs underline text-red-600">
        削除
      </button>
    </form>
  );
}
