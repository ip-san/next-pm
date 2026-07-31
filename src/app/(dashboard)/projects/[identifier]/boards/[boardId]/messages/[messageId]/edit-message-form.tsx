"use client";

import { useActionState, useState } from "react";
import { editMessageAction, type MessageMutationActionState } from "@/interface/actions/message-actions";

const initialState: MessageMutationActionState = { error: null };

export function EditMessageForm({
  projectIdentifier,
  boardId,
  messageId,
  subject,
  content,
}: {
  projectIdentifier: string;
  boardId: string;
  messageId: string;
  subject: string;
  content: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(editMessageAction, initialState);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs underline">
        編集
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 mt-2">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="messageId" value={messageId} />
      <input name="subject" defaultValue={subject} maxLength={255} required className="border rounded px-3 py-2 text-sm" />
      <textarea name="content" defaultValue={content} required rows={4} className="border rounded px-3 py-2 text-sm" />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-1 text-sm self-start disabled:opacity-50">
        保存
      </button>
    </form>
  );
}
