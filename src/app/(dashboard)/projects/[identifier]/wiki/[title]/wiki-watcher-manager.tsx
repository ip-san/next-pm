"use client";

import { useActionState } from "react";
import {
  addWikiPageWatcherAction,
  removeWikiPageWatcherAction,
  type WatcherActionState,
} from "@/interface/actions/watcher-actions";

const initialState: WatcherActionState = { error: null };

export interface WikiWatcherUser {
  id: string;
  label: string;
}

function RemoveWikiWatcherButton({
  pageId,
  title,
  projectIdentifier,
  userId,
}: {
  pageId: string;
  title: string;
  projectIdentifier: string;
  userId: string;
}) {
  const [state, formAction, pending] = useActionState(removeWikiPageWatcherAction, initialState);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" disabled={pending} className="text-xs underline text-red-600 disabled:opacity-50">
        削除
      </button>
      {state.error ? <span className="text-xs text-red-600 ml-1">{state.error}</span> : null}
    </form>
  );
}

export function WikiWatcherManager({
  pageId,
  title,
  projectIdentifier,
  watchers,
  candidates,
  canAdd,
  canRemove,
}: {
  pageId: string;
  title: string;
  projectIdentifier: string;
  watchers: WikiWatcherUser[];
  candidates: WikiWatcherUser[];
  canAdd: boolean;
  canRemove: boolean;
}) {
  const [addState, addFormAction, addPending] = useActionState(addWikiPageWatcherAction, initialState);

  return (
    <section className="flex flex-col gap-2 text-sm">
      <h2 className="font-medium">ウォッチャー</h2>
      {watchers.length === 0 ? (
        <p className="text-gray-500 text-xs">なし</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {watchers.map((watcher) => (
            <li key={watcher.id} className="flex items-center gap-2">
              <span>{watcher.label}</span>
              {canRemove ? (
                <RemoveWikiWatcherButton
                  pageId={pageId}
                  title={title}
                  projectIdentifier={projectIdentifier}
                  userId={watcher.id}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canAdd && candidates.length > 0 ? (
        <form action={addFormAction} className="flex items-center gap-2">
          <input type="hidden" name="pageId" value={pageId} />
          <input type="hidden" name="title" value={title} />
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
      {addState.error ? (
        <p role="alert" className="text-xs text-red-600">
          {addState.error}
        </p>
      ) : null}
    </section>
  );
}
