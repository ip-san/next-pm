"use client";

import { useActionState } from "react";
import { renameWikiPageAction, type RenameWikiPageActionState } from "@/interface/actions/wiki-actions";

const initialState: RenameWikiPageActionState = { error: null };

export function WikiRenameForm({
  pageId,
  projectIdentifier,
  title,
}: {
  pageId: string;
  projectIdentifier: string;
  title: string;
}) {
  const [state, formAction, pending] = useActionState(renameWikiPageAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-md">
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <div className="flex flex-col gap-1">
        <label htmlFor="newTitle" className="text-sm font-medium">
          新しいタイトル
        </label>
        <input id="newTitle" name="newTitle" defaultValue={title} className="border rounded px-3 py-2" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="keepRedirect" defaultChecked />
        既存のリンクをリダイレクトする
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? "変更中…" : "名前を変更"}
      </button>
    </form>
  );
}
