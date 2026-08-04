"use client";

import { useActionState } from "react";
import { syncRepositoryAction, type SyncRepositoryActionState } from "@/interface/actions/scm-actions";

const initialState: SyncRepositoryActionState = { error: null, summary: null };

export function SyncRepositoryButton({ projectIdentifier }: { projectIdentifier: string }) {
  const [state, formAction, pending] = useActionState(syncRepositoryAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-1 items-start">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <button type="submit" disabled={pending} className="border rounded px-3 py-1.5 text-sm disabled:opacity-50">
        {pending ? "同期中…" : "リポジトリを同期"}
      </button>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      {state.summary ? <p className="text-xs text-gray-600">{state.summary}</p> : null}
    </form>
  );
}
