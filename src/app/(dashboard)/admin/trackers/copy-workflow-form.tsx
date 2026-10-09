"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { copyTrackerWorkflowAction } from "@/interface/actions/admin-tracker-actions";
import type { AdminActionState } from "@/interface/actions/admin-action-state";
import type { Tracker } from "@/domain/tracker/entity";

const initialState: AdminActionState = { error: null };

/** Redmine's `copy_workflow_from`, offered on an existing tracker instead of only at creation. */
export function CopyWorkflowForm({ locale = "ja", tracker, trackers }: { tracker: Tracker; trackers: Tracker[]; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(copyTrackerWorkflowAction, initialState);
  const sources = trackers.filter((candidate) => candidate.id !== tracker.id);

  if (sources.length === 0) {
    return <p className="text-sm text-gray-500">{t("admin.trackers.noSource")}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-sm">
      <input type="hidden" name="trackerId" value={tracker.id} />
      <div className="flex flex-col gap-1">
        <label htmlFor="sourceTrackerId" className="text-sm font-medium">
          {t("admin.roles.copyWorkflowFrom")}
        </label>
        <select id="sourceTrackerId" name="sourceTrackerId" required defaultValue="" className="border rounded px-3 py-2">
          <option value="">{t("admin.select")}</option>
          {sources.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-gray-500">
        {t("admin.trackers.copyWorkflowHelp")}
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="border rounded px-3 py-2 disabled:opacity-50">
        {pending ? t("admin.roles.copying") : t("admin.trackers.copyWorkflowSubmit")}
      </button>
    </form>
  );
}
