"use client";

import { useActionState } from "react";
import { removeUserFromGroupAction, type GroupActionState } from "@/interface/actions/group-actions";

const initialState: GroupActionState = { error: null };

export function RemoveUserFromGroupButton({ groupId, userId }: { groupId: string; userId: string }) {
  const [state, formAction, pending] = useActionState(removeUserFromGroupAction, initialState);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="userId" value={userId} />
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="text-xs underline text-red-600">
        削除
      </button>
    </form>
  );
}
