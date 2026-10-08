"use client";

import { useActionState } from "react";
import { bulkUpdateTimeEntriesAction, type BulkTimeEntryActionState } from "@/interface/actions/time-entry-actions";

const initialState: BulkTimeEntryActionState = { error: null, message: null };

/** Redmine's timelog bulk edit for the attributes that stay in the project and issue: activity, hours, date and comments. */
export function BulkTimeEntryForm({
  projectIdentifier,
  entryIds,
  activities,
}: {
  projectIdentifier: string;
  entryIds: string[];
  activities: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(bulkUpdateTimeEntriesAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-sm">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      {entryIds.map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}

      <div className="flex flex-col gap-1">
        <label htmlFor="bulk-activity" className="text-sm font-medium">
          作業分類
        </label>
        <select id="bulk-activity" name="activityId" defaultValue="" className="border rounded px-3 py-2">
          <option value="">(変更しない)</option>
          {activities.map((activity) => (
            <option key={activity.id} value={activity.id}>
              {activity.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="bulk-hours" className="text-sm font-medium">
          時間（空欄は変更しない）
        </label>
        <input id="bulk-hours" name="hours" type="number" min="0.01" step="any" className="border rounded px-3 py-2" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="bulk-spent-on" className="text-sm font-medium">
          日付（空欄は変更しない）
        </label>
        <input id="bulk-spent-on" name="spentOn" type="date" className="border rounded px-3 py-2" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="bulk-comments" className="text-sm font-medium">
          コメント（空欄は変更しない）
        </label>
        <textarea id="bulk-comments" name="comments" rows={2} className="border rounded px-3 py-2" />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.message ? <p className="text-sm text-green-700">{state.message}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? "更新中…" : "更新"}
      </button>
    </form>
  );
}
