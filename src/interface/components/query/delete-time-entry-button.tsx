"use client";

import { useActionState } from "react";
import type { Locale } from "@/domain/i18n/locales";
import { translate } from "@/domain/i18n/messages";
import { deleteTimeEntryAction, type DeleteTimeEntryActionState } from "@/interface/actions/time-entry-actions";

const initialState: DeleteTimeEntryActionState = { error: null };

export function DeleteTimeEntryButton({
  projectIdentifier,
  entryId,
  locale = "ja",
}: {
  projectIdentifier: string;
  entryId: string;
  locale?: Locale;
}) {
  const [state, formAction, pending] = useActionState(deleteTimeEntryAction, initialState);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="entryId" value={entryId} />
      {state.error ? (
        <span role="alert" className="text-xs text-red-600 mr-2">
          {state.error}
        </span>
      ) : null}
      <button type="submit" disabled={pending} className="text-xs underline text-red-600 disabled:opacity-50">
        {translate(locale, "timeEntries.delete")}
      </button>
    </form>
  );
}
