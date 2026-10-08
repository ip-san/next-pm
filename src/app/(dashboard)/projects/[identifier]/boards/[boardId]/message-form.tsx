"use client";

import { useActionState } from "react";
import { postMessageAction, type PostMessageActionState } from "@/interface/actions/message-actions";

const initialState: PostMessageActionState = { error: null };

export function MessageForm({
  projectIdentifier,
  boardId,
  parentId,
  replySubject,
  defaultContent,
}: {
  projectIdentifier: string;
  boardId: string;
  parentId: string | null;
  /** Prefilled subject for a reply — "RE: <topic>", or the quoted variant (MessagesController#quote). */
  replySubject?: string;
  /** Prefilled body when replying via 引用 (quote). */
  defaultContent?: string;
}) {
  const [state, formAction, pending] = useActionState(postMessageAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-2xl">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="boardId" value={boardId} />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      {parentId ? (
        <input type="hidden" name="subject" value={replySubject ?? ""} />
      ) : (
        <input name="subject" placeholder="件名" maxLength={255} required className="border rounded px-3 py-2 text-sm" />
      )}
      <textarea
        name="content"
        // `key` forces React to re-seed the textarea when the quoted body changes: the reply
        // form stays mounted while the ?quote= search param navigates.
        key={defaultContent ?? ""}
        defaultValue={defaultContent ?? ""}
        placeholder={parentId ? "返信" : "本文"}
        required
        rows={5}
        className="border rounded px-3 py-2 text-sm"
      />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 text-sm self-start disabled:opacity-50">
        {pending ? "送信中…" : parentId ? "返信する" : "投稿する"}
      </button>
    </form>
  );
}
