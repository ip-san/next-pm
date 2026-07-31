"use client";

import { useActionState } from "react";
import { addIssueWatcherAction, removeIssueWatcherAction, type WatcherActionState } from "@/interface/actions/watcher-actions";

const initialState: WatcherActionState = { error: null };

interface WatcherUser {
  id: string;
  label: string;
}

function RemoveWatcherButton({ issueId, projectIdentifier, userId }: { issueId: string; projectIdentifier: string; userId: string }) {
  const [state, formAction, pending] = useActionState(removeIssueWatcherAction, initialState);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="issueId" value={issueId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" disabled={pending} className="text-xs underline text-red-600 disabled:opacity-50">
        削除
      </button>
      {state.error ? <span className="text-xs text-red-600 ml-1">{state.error}</span> : null}
    </form>
  );
}

export function WatcherManager({
  issueId,
  projectIdentifier,
  watchers,
  candidates,
  canAdd,
  canRemove,
}: {
  issueId: string;
  projectIdentifier: string;
  watchers: WatcherUser[];
  candidates: WatcherUser[];
  canAdd: boolean;
  canRemove: boolean;
}) {
  const [addState, addFormAction, addPending] = useActionState(addIssueWatcherAction, initialState);

  return (
    <div className="flex flex-col gap-2 text-sm">
      <h3 className="font-medium">ウォッチャー</h3>
      {watchers.length === 0 ? (
        <p className="text-gray-500 text-xs">なし</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {watchers.map((watcher) => (
            <li key={watcher.id} className="flex items-center gap-2">
              <span>{watcher.label}</span>
              {canRemove ? <RemoveWatcherButton issueId={issueId} projectIdentifier={projectIdentifier} userId={watcher.id} /> : null}
            </li>
          ))}
        </ul>
      )}
      {canAdd && candidates.length > 0 ? (
        <form action={addFormAction} className="flex items-center gap-2">
          <input type="hidden" name="issueId" value={issueId} />
          <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
          <select name="userId" defaultValue="" required className="border rounded px-2 py-1 text-xs">
            <option value="" disabled>
              ユーザーを選択
            </option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>
          <button type="submit" disabled={addPending} className="border rounded px-2 py-1 text-xs disabled:opacity-50">
            追加
          </button>
        </form>
      ) : null}
      {addState.error ? <p role="alert" className="text-xs text-red-600">{addState.error}</p> : null}
    </div>
  );
}
