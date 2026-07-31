"use client";

import { useActionState } from "react";
import { uploadDocumentAttachmentAction, type UploadDocumentAttachmentActionState } from "@/interface/actions/document-actions";

const initialState: UploadDocumentAttachmentActionState = { error: null };

export function DocumentAttachmentUploadForm({ documentId, projectIdentifier }: { documentId: string; projectIdentifier: string }) {
  const [state, formAction, pending] = useActionState(uploadDocumentAttachmentAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="file" name="file" required className="text-sm" />
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-1 text-sm disabled:opacity-50">
        {pending ? "アップロード中…" : "添付"}
      </button>
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
