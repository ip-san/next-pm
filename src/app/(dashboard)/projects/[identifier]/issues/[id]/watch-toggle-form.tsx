"use client";

import { useActionState } from "react";
import { toggleIssueWatchAction, type ToggleWatchActionState } from "@/interface/actions/watcher-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: ToggleWatchActionState = { error: null };

export function WatchToggleForm({
  issueId,
  projectIdentifier,
  isWatching,
  locale,
}: {
  issueId: string;
  projectIdentifier: string;
  isWatching: boolean;
  locale: Locale;
}) {
  const [state, formAction, pending] = useActionState(toggleIssueWatchAction, initialState);
  const t = (key: MessageKey) => translate(locale, key);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="issueId" value={issueId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <button type="submit" disabled={pending} className="border rounded px-3 py-1 text-sm disabled:opacity-50">
        {isWatching ? t("issue.unwatch") : t("issue.watch")}
      </button>
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
