"use client";

import { useActionState } from "react";
import { addNewsCommentAction, type AddNewsCommentActionState } from "@/interface/actions/news-actions";

const initialState: AddNewsCommentActionState = { error: null };

export function NewsCommentForm({ projectIdentifier, newsId }: { projectIdentifier: string; newsId: string }) {
  const [state, formAction, pending] = useActionState(addNewsCommentAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-2xl">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="newsId" value={newsId} />
      <textarea name="content" placeholder="コメント" required rows={3} className="border rounded px-3 py-2 text-sm" />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 text-sm self-start disabled:opacity-50">
        コメントする
      </button>
    </form>
  );
}
