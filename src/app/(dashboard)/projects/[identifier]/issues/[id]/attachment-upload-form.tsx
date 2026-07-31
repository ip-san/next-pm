"use client";

import { useActionState } from "react";
import { uploadIssueAttachmentAction, type UploadAttachmentActionState } from "@/interface/actions/attachment-actions";

const initialState: UploadAttachmentActionState = { error: null };

export function AttachmentUploadForm({ issueId, projectIdentifier }: { issueId: string; projectIdentifier: string }) {
  const [state, formAction, pending] = useActionState(uploadIssueAttachmentAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="issueId" value={issueId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="file" name="file" required className="text-sm" />
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-1 text-sm disabled:opacity-50">
        {pending ? "アップロード中…" : "添付"}
      </button>
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
