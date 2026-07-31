"use client";

import { useActionState } from "react";
import { deleteMessageAction, type MessageMutationActionState } from "@/interface/actions/message-actions";

const initialState: MessageMutationActionState = { error: null };

export function DeleteMessageButton({ projectIdentifier, boardId, messageId }: { projectIdentifier: string; boardId: string; messageId: string }) {
  const [state, formAction, pending] = useActionState(deleteMessageAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="messageId" value={messageId} />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="text-xs underline text-red-600">
        削除
      </button>
    </form>
  );
}
