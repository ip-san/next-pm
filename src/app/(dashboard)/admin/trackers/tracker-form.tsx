"use client";

import { useActionState } from "react";
import { createTrackerAction, type AdminActionState } from "@/interface/actions/admin-actions";
import type { IssueStatus } from "@/domain/issue-status/entity";

const initialState: AdminActionState = { error: null };

export function TrackerForm({ statuses }: { statuses: IssueStatus[] }) {
  const [state, formAction, pending] = useActionState(createTrackerAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-sm">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          名称
        </label>
        <input id="name" name="name" required className="border rounded px-3 py-2" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="defaultStatusId" className="text-sm font-medium">
          既定のステータス
        </label>
        <select id="defaultStatusId" name="defaultStatusId" required className="border rounded px-3 py-2">
          <option value="">選択してください</option>
          {statuses.map((status) => (
            <option key={status.id} value={status.id}>
              {status.name}
            </option>
          ))}
        </select>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {pending ? "追加中…" : "トラッカーを追加"}
      </button>
    </form>
  );
}
