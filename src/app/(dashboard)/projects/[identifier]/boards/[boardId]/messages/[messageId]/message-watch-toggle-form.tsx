"use client";

import { useActionState } from "react";
import { toggleMessageWatchAction, type ToggleWatchActionState } from "@/interface/actions/watcher-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: ToggleWatchActionState = { error: null };

export function MessageWatchToggleForm({
  messageId,
  boardId,
  projectIdentifier,
  isWatching,
  locale = "ja",
}: {
  messageId: string;
  boardId: string;
  projectIdentifier: string;
  isWatching: boolean;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);

  const [state, formAction, pending] = useActionState(toggleMessageWatchAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <button type="submit" disabled={pending} className="border rounded px-3 py-1 text-sm disabled:opacity-50">
        {isWatching ? t("issue.unwatch") : t("issue.watch")}
      </button>
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
