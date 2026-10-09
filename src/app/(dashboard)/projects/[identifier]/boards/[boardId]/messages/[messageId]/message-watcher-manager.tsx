"use client";

import { useActionState } from "react";
import { addMessageWatcherAction, removeMessageWatcherAction, type WatcherActionState } from "@/interface/actions/watcher-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

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
  locale,
}: {
  messageId: string;
  boardId: string;
  projectIdentifier: string;
  userId: string;
  locale: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(removeMessageWatcherAction, initialState);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" disabled={pending} className="text-xs underline text-red-600 disabled:opacity-50">
        {t("issue.delete")}
      </button>
      {state.error ? <span className="text-xs text-red-600 ml-1">{state.error}</span> : null}
    </form>
  );
}

/**
 * Mirrors Redmine's watchers/_watchers partial for a Message: only the root topic is
 * watchable, the "add" control hangs off add_message_watchers, and the *names list* is a
 * separate gate (view_message_watchers) — a user who may add watchers but not view them gets
 * the heading and the form, never the roster.
 */
export function MessageWatcherManager({
  messageId,
  boardId,
  projectIdentifier,
  watchers,
  candidates,
  canView,
  canAdd,
  canRemove,
  locale = "ja",
}: {
  messageId: string;
  boardId: string;
  projectIdentifier: string;
  watchers: WatcherUser[];
  candidates: WatcherUser[];
  canView: boolean;
  canAdd: boolean;
  canRemove: boolean;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [addState, addFormAction, addPending] = useActionState(addMessageWatcherAction, initialState);

  return (
    <div className="flex flex-col gap-2 text-sm">
      <h3 className="font-medium">{t("issue.watchers")}{canView ? ` (${watchers.length})` : ""}</h3>
      {!canView ? null : watchers.length === 0 ? (
        <p className="text-gray-500 text-xs">{t("issue.noWatchers")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {watchers.map((watcher) => (
            <li key={watcher.id} className="flex items-center gap-2">
              <span>{watcher.label}</span>
              {canRemove ? (
                <RemoveWatcherButton messageId={messageId} boardId={boardId} projectIdentifier={projectIdentifier} userId={watcher.id} locale={locale} />
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
              {t("issue.selectUser")}
            </option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>
          <button type="submit" disabled={addPending} className="border rounded px-2 py-1 text-xs disabled:opacity-50">
            {t("issue.add")}
          </button>
        </form>
      ) : null}
      {addState.error ? <p role="alert" className="text-xs text-red-600">{addState.error}</p> : null}
    </div>
  );
}
