"use client";

import { useActionState } from "react";
import { saveWikiPageAction, type SaveWikiPageActionState } from "@/interface/actions/wiki-actions";

const initialState: SaveWikiPageActionState = { error: null };

export function WikiEditForm({
  projectId,
  projectIdentifier,
  title,
  initialText,
}: {
  projectId: string;
  projectIdentifier: string;
  title: string;
  initialText: string;
}) {
  const [state, formAction, pending] = useActionState(saveWikiPageAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-2xl">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="title" value={title} />
      <div className="flex flex-col gap-1">
        <label htmlFor="text" className="text-sm font-medium">
          本文
        </label>
        <textarea id="text" name="text" rows={16} defaultValue={initialText} className="border rounded px-3 py-2 font-mono text-sm" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="comments" className="text-sm font-medium">
          コメント
        </label>
        <input id="comments" name="comments" className="border rounded px-3 py-2" />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? "保存中…" : "保存"}
      </button>
    </form>
  );
}
