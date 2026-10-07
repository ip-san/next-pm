"use client";

import { useActionState } from "react";
import { deleteProjectFileAction, type FileActionState } from "@/interface/actions/file-actions";

const initialState: FileActionState = { error: null };

export function DeleteFileButton({ projectIdentifier, attachmentId }: { projectIdentifier: string; attachmentId: string }) {
  const [state, formAction, pending] = useActionState(deleteProjectFileAction, initialState);

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
