"use client";

import { useActionState, useState } from "react";
import { editMessageAction, type MessageMutationActionState } from "@/interface/actions/message-actions";

const initialState: MessageMutationActionState = { error: null };

export interface MoveTargetBoard {
  id: string;
  name: string;
}

export function EditMessageForm({
  projectIdentifier,
  boardId,
  messageId,
  subject,
  content,
  isTopic,
  locked,
  sticky,
  /** Non-empty only for a topic edited by someone holding edit_messages — Redmine's conditional safe attributes. */
  moveTargets,
  canEditAllMessages,
}: {
  projectIdentifier: string;
  boardId: string;
  messageId: string;
  subject: string;
  content: string;
  isTopic: boolean;
  locked: boolean;
  sticky: boolean;
  moveTargets: MoveTargetBoard[];
  canEditAllMessages: boolean;
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
      {canEditAllMessages && isTopic ? (
        <>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" name="sticky" defaultChecked={sticky} />
            常に先頭に表示
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" name="locked" defaultChecked={locked} />
            ロック
          </label>
          {moveTargets.length > 0 ? (
            <label className="flex items-center gap-2 text-xs">
              フォーラム
              <select name="targetBoardId" defaultValue={boardId} className="border rounded px-2 py-1 text-xs">
                {moveTargets.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </>
      ) : null}
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-1 text-sm self-start disabled:opacity-50">
        保存
      </button>
    </form>
  );
}
