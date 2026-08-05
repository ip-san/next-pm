"use client";

import { useActionState } from "react";
import { updateTimelogDaysAction, type MyPageActionState } from "@/interface/actions/my-page-actions";

const initialState: MyPageActionState = { error: null };

export function TimelogDaysForm({ days }: { days: number }) {
  const [state, formAction, pending] = useActionState(updateTimelogDaysAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2 text-xs text-gray-500">
      過去
      <input type="number" name="days" defaultValue={days} min={1} max={365} className="border rounded w-16 px-1 py-0.5" />
      日間
      <button type="submit" disabled={pending} className="underline">
        変更
      </button>
      {state.error ? <span className="text-red-600">{state.error}</span> : null}
    </form>
  );
}
