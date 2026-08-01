"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { deleteGroupAction, type GroupActionState } from "@/interface/actions/group-actions";

const initialState: GroupActionState = { error: null };

export function DeleteGroupButton({ groupId }: { groupId: string }) {
  const [state, formAction, pending] = useActionState(deleteGroupAction, initialState);
  const router = useRouter();

  return (
    <form
      action={formAction}
      onSubmit={() => {
        router.push("/admin/groups");
      }}
    >
      <input type="hidden" name="groupId" value={groupId} />
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="border rounded px-3 py-2 text-sm text-red-600">
        グループを削除
      </button>
    </form>
  );
}
