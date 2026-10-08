"use client";

import { useActionState } from "react";
import { copyTrackerWorkflowAction } from "@/interface/actions/admin-tracker-actions";
import type { AdminActionState } from "@/interface/actions/admin-action-state";
import type { Tracker } from "@/domain/tracker/entity";

const initialState: AdminActionState = { error: null };

/** Redmine's `copy_workflow_from`, offered on an existing tracker instead of only at creation. */
export function CopyWorkflowForm({ tracker, trackers }: { tracker: Tracker; trackers: Tracker[] }) {
  const [state, formAction, pending] = useActionState(copyTrackerWorkflowAction, initialState);
  const sources = trackers.filter((candidate) => candidate.id !== tracker.id);

  if (sources.length === 0) {
    return <p className="text-sm text-gray-500">コピー元にできる他のトラッカーがありません。</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-sm">
      <input type="hidden" name="trackerId" value={tracker.id} />
      <div className="flex flex-col gap-1">
        <label htmlFor="sourceTrackerId" className="text-sm font-medium">
          ワークフローのコピー元
        </label>
        <select id="sourceTrackerId" name="sourceTrackerId" required defaultValue="" className="border rounded px-3 py-2">
          <option value="">選択してください</option>
          {sources.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-gray-500">
        コピー元の遷移とフィールド権限で、このトラッカーの既存のワークフローを全ロール分置き換えます。
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="border rounded px-3 py-2 disabled:opacity-50">
        {pending ? "コピー中…" : "ワークフローをコピー"}
      </button>
    </form>
  );
}
