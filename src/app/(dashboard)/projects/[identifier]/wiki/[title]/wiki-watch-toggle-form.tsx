"use client";

import { useActionState } from "react";
import { toggleWikiPageWatchAction, type ToggleWatchActionState } from "@/interface/actions/watcher-actions";

const initialState: ToggleWatchActionState = { error: null };

export function WikiWatchToggleForm({
  pageId,
  title,
  projectIdentifier,
  isWatching,
}: {
  pageId: string;
  title: string;
  projectIdentifier: string;
  isWatching: boolean;
}) {
  const [state, formAction, pending] = useActionState(toggleWikiPageWatchAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <button type="submit" disabled={pending} className="border rounded px-3 py-1 text-sm disabled:opacity-50">
        {isWatching ? "ウォッチ中止" : "ウォッチする"}
      </button>
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
