"use client";

import { useActionState } from "react";
import { postMessageAction, type PostMessageActionState } from "@/interface/actions/message-actions";

const initialState: PostMessageActionState = { error: null };

export function MessageForm({
  projectIdentifier,
  boardId,
  parentId,
  topicSubject,
}: {
  projectIdentifier: string;
  boardId: string;
  parentId: string | null;
  topicSubject?: string;
}) {
  const [state, formAction, pending] = useActionState(postMessageAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-2xl">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="boardId" value={boardId} />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      {parentId ? (
        <input type="hidden" name="subject" value={`Re: ${topicSubject ?? ""}`} />
      ) : (
        <input name="subject" placeholder="件名" maxLength={255} required className="border rounded px-3 py-2 text-sm" />
      )}
      <textarea name="content" placeholder={parentId ? "返信" : "本文"} required rows={5} className="border rounded px-3 py-2 text-sm" />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 text-sm self-start disabled:opacity-50">
        {pending ? "送信中…" : parentId ? "返信する" : "投稿する"}
      </button>
    </form>
  );
}
