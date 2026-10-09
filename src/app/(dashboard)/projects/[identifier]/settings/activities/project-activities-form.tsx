"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { updateProjectActivitiesAction, type ProjectActivitiesActionState } from "@/interface/actions/project-actions";

const initialState: ProjectActivitiesActionState = { error: null };

export function ProjectActivitiesForm({
  projectIdentifier,
  activities,
  activeByActivityId,
  locale = "ja",
}: {
  projectIdentifier: string;
  /** The system-wide activities; a project can only switch these on and off, not add its own. */
  activities: { id: string; name: string }[];
  activeByActivityId: Record<string, boolean>;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(updateProjectActivitiesAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-md">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      {activities.map((activity) => (
        <label key={activity.id} className="flex items-center gap-2 text-sm">
          {/* The id is submitted for every row, checked or not, so an unchecked box is
              "deactivate here" rather than "leave alone". */}
          <input type="hidden" name="activityIds" value={activity.id} />
          <input type="checkbox" name="activeActivityIds" value={activity.id} defaultChecked={activeByActivityId[activity.id]} />
          {activity.name}
        </label>
      ))}
      {activities.length === 0 ? <p className="text-sm text-gray-400">{t("projectSettings.activitiesNone")}</p> : null}
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? t("issue.saving") : t("issue.save")}
      </button>
    </form>
  );
}
