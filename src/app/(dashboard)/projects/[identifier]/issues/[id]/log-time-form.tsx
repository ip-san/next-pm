"use client";

import { useActionState } from "react";
import { logTimeAction, type LogTimeActionState } from "@/interface/actions/time-entry-actions";
import type { Enumeration } from "@/domain/enumeration/entity";

const initialState: LogTimeActionState = { error: null };

export function LogTimeForm({
  issueId,
  projectIdentifier,
  activities,
}: {
  issueId: string;
  projectIdentifier: string;
  activities: Enumeration[];
}) {
  const [state, formAction, pending] = useActionState(logTimeAction, initialState);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-sm">
      <input type="hidden" name="issueId" value={issueId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <div className="flex flex-col gap-1">
        <label htmlFor="activityId" className="text-sm font-medium">
          作業分類
        </label>
        <select id="activityId" name="activityId" className="border rounded px-3 py-2">
          {activities.map((activity) => (
            <option key={activity.id} value={activity.id}>
              {activity.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="hours" className="text-sm font-medium">
          作業時間
        </label>
        <input id="hours" name="hours" type="number" step="0.25" min="0.25" required className="border rounded px-3 py-2" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="spentOn" className="text-sm font-medium">
          日付
        </label>
        <input id="spentOn" name="spentOn" type="date" defaultValue={today} required className="border rounded px-3 py-2" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="comments" className="text-sm font-medium">
          コメント
        </label>
        <input id="comments" name="comments" className="border rounded px-3 py-2" />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {pending ? "記録中…" : "工数を記録"}
      </button>
    </form>
  );
}
