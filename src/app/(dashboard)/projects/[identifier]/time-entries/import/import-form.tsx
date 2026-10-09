"use client";

import { useActionState } from "react";
import { importTimeEntriesCsvAction, type ImportTimeEntriesActionState } from "@/interface/actions/time-entry-import-actions";
import type { Locale } from "@/domain/i18n/locales";
import { interpolate, translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: ImportTimeEntriesActionState = { error: null, summary: null };

export function ImportTimeEntriesForm({ projectIdentifier, locale = "ja" }: { projectIdentifier: string; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(importTimeEntriesCsvAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-lg">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <div className="flex flex-col gap-1">
        <label htmlFor="file" className="text-sm font-medium">
          {t("timeEntries.importFile")}
        </label>
        <input id="file" name="file" type="file" accept=".csv,text/csv" required className="border rounded px-3 py-2 text-sm" />
      </div>
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? t("timeEntries.importing") : t("timeEntries.import")}
      </button>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.summary ? (
        <div className="text-sm flex flex-col gap-1">
          <p className="text-green-700">
            {interpolate(t("timeEntries.importCreated"), { count: state.summary.created })}
            {state.summary.failed > 0 ? interpolate(t("timeEntries.importFailed"), { count: state.summary.failed }) : ""}
          </p>
          {state.summary.rowErrors.length > 0 ? (
            <ul className="text-red-600 text-xs flex flex-col gap-0.5">
              {state.summary.rowErrors.map((rowError) => (
                <li key={rowError}>{rowError}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
