"use client";

import { useActionState } from "react";
import { createGroupAction, type GroupActionState } from "@/interface/actions/group-actions";

const initialState: GroupActionState = { error: null };

export function GroupForm() {
  const [state, formAction, pending] = useActionState(createGroupAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-sm border-t pt-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          グループ名
        </label>
        <input id="name" name="name" required maxLength={30} className="border rounded px-3 py-2" />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? "追加中…" : "グループを追加"}
      </button>
    </form>
  );
}
