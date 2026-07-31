"use client";

import { useActionState } from "react";
import { deleteDocumentAction, type DeleteDocumentActionState } from "@/interface/actions/document-actions";

const initialState: DeleteDocumentActionState = { error: null };

export function DeleteDocumentButton({ projectIdentifier, documentId }: { projectIdentifier: string; documentId: string }) {
  const [state, formAction, pending] = useActionState(deleteDocumentAction, initialState);

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="documentId" value={documentId} />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="text-xs underline text-red-600">
        ドキュメントを削除
      </button>
    </form>
  );
}
