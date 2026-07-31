"use client";

import { useActionState } from "react";
import { createIssueStatusAction, type AdminActionState } from "@/interface/actions/admin-actions";

const initialState: AdminActionState = { error: null };

export function IssueStatusForm() {
  const [state, formAction, pending] = useActionState(createIssueStatusAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-sm">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          名称
        </label>
        <input id="name" name="name" required maxLength={30} className="border rounded px-3 py-2" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isClosed" />
        完了ステータスとして扱う
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {pending ? "追加中…" : "ステータスを追加"}
      </button>
    </form>
  );
}
