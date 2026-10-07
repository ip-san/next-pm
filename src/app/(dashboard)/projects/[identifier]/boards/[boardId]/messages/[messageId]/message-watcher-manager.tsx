"use client";

import { useActionState } from "react";
import { addMessageWatcherAction, removeMessageWatcherAction, type WatcherActionState } from "@/interface/actions/watcher-actions";

const initialState: WatcherActionState = { error: null };

interface WatcherUser {
  id: string;
  label: string;
}

function RemoveWatcherButton({
  messageId,
  boardId,
  projectIdentifier,
  userId,
}: {
  messageId: string;
  boardId: string;
  projectIdentifier: string;
  userId: string;
}) {
  const [state, formAction, pending] = useActionState(removeMessageWatcherAction, initialState);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" disabled={pending} className="text-xs underline text-red-600 disabled:opacity-50">
        削除
      </button>
      {state.error ? <span className="text-xs text-red-600 ml-1">{state.error}</span> : null}
    </form>
  );
}

/** Mirrors the watchers sidebar on Redmine's messages/show: only the root topic is watchable. */
export function MessageWatcherManager({
  messageId,
  boardId,
  projectIdentifier,
  watchers,
  candidates,
  canAdd,
  canRemove,
}: {
  messageId: string;
  boardId: string;
  projectIdentifier: string;
  watchers: WatcherUser[];
  candidates: WatcherUser[];
  canAdd: boolean;
  canRemove: boolean;
}) {
  const [addState, addFormAction, addPending] = useActionState(addMessageWatcherAction, initialState);

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
              {canRemove ? (
                <RemoveWatcherButton messageId={messageId} boardId={boardId} projectIdentifier={projectIdentifier} userId={watcher.id} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canAdd && candidates.length > 0 ? (
        <form action={addFormAction} className="flex items-center gap-2">
          <input type="hidden" name="messageId" value={messageId} />
          <input type="hidden" name="boardId" value={boardId} />
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
