"use client";

import { useActionState } from "react";
import { createBoardAction, type CreateBoardActionState } from "@/interface/actions/board-actions";

const initialState: CreateBoardActionState = { error: null };

export function BoardCreateForm({ projectIdentifier }: { projectIdentifier: string }) {
  const [state, formAction, pending] = useActionState(createBoardAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-md border-t pt-4">
      <h2 className="font-medium text-sm">フォーラムを作成</h2>
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input name="name" placeholder="名前" maxLength={30} required className="border rounded px-3 py-2 text-sm" />
      <textarea name="description" placeholder="説明" maxLength={255} required className="border rounded px-3 py-2 text-sm" />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 text-sm self-start disabled:opacity-50">
        作成
      </button>
    </form>
  );
}
