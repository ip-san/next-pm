"use client";

import { useActionState } from "react";
import { addMyPageBlockAction, type MyPageActionState } from "@/interface/actions/my-page-actions";
import type { MyPageBlockType } from "@/domain/my-page/entity";

const initialState: MyPageActionState = { error: null };

export function AddBlockForm({ options }: { options: { value: MyPageBlockType; label: string }[] }) {
  const [state, formAction, pending] = useActionState(addMyPageBlockAction, initialState);

  if (options.length === 0) {
    return null;
  }

  return (
    <form action={formAction} className="flex items-center gap-2 text-sm">
      <select name="block" className="border rounded px-2 py-1">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="border rounded px-3 py-1 disabled:opacity-50">
        ブロックを追加
      </button>
      {state.error ? <span className="text-red-600 text-xs">{state.error}</span> : null}
    </form>
  );
}
