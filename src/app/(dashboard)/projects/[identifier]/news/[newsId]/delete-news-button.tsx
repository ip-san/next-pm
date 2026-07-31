"use client";

import { useActionState } from "react";
import { deleteNewsAction, type DeleteNewsActionState } from "@/interface/actions/news-actions";

const initialState: DeleteNewsActionState = { error: null };

export function DeleteNewsButton({ projectIdentifier, newsId }: { projectIdentifier: string; newsId: string }) {
  const [state, formAction, pending] = useActionState(deleteNewsAction, initialState);

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="newsId" value={newsId} />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="text-xs underline text-red-600">
        削除
      </button>
    </form>
  );
}
