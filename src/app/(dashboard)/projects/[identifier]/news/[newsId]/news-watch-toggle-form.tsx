"use client";

import { useActionState } from "react";
import { toggleNewsWatchAction, type ToggleWatchActionState } from "@/interface/actions/watcher-actions";

const initialState: ToggleWatchActionState = { error: null };

export function NewsWatchToggleForm({ newsId, projectIdentifier, isWatching }: { newsId: string; projectIdentifier: string; isWatching: boolean }) {
  const [state, formAction, pending] = useActionState(toggleNewsWatchAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="newsId" value={newsId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <button type="submit" disabled={pending} className="border rounded px-3 py-1 text-sm disabled:opacity-50">
        {isWatching ? "ウォッチ中止" : "ウォッチする"}
      </button>
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
