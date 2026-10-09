"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { createTrackerAction, updateTrackerAction } from "@/interface/actions/admin-tracker-actions";
import type { AdminActionState } from "@/interface/actions/admin-action-state";
import { TRACKER_CORE_FIELDS, type TrackerCoreField } from "@/domain/tracker/core-fields";
import type { IssueStatus } from "@/domain/issue-status/entity";
import type { Tracker } from "@/domain/tracker/entity";

const initialState: AdminActionState = { error: null };

const CORE_FIELD_LABEL_KEY: Record<TrackerCoreField, MessageKey> = {
  assignedToId: "issue.attr.assignedToId",
  categoryId: "issue.attr.categoryId",
  fixedVersionId: "issue.attr.fixedVersionId",
  parentId: "issue.attr.parentId",
  startDate: "issue.attr.startDate",
  dueDate: "issue.attr.dueDate",
  estimatedHours: "issue.attr.estimatedHours",
  doneRatio: "issue.attr.doneRatio",
  description: "issue.attr.description",
  priorityId: "issue.attr.priorityId",
};

/**
 * Doubles as the create and the edit form. On create it also offers Redmine's
 * `copy_workflow_from` select, which seeds the new tracker's workflow from an existing one.
 */
export function TrackerForm({
  statuses,
  trackers,
  tracker,
  locale = "ja",
}: {
  statuses: IssueStatus[];
  trackers: Tracker[];
  tracker?: Tracker;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(
    tracker ? updateTrackerAction : createTrackerAction,
    initialState,
  );
  const disabled = new Set(tracker?.disabledCoreFields ?? []);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-sm">
      {tracker ? <input type="hidden" name="trackerId" value={tracker.id} /> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          {t("admin.trackers.name")}
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={30}
          defaultValue={tracker?.name}
          className="border rounded px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="defaultStatusId" className="text-sm font-medium">
          {t("admin.trackers.defaultStatus")}
        </label>
        <select
          id="defaultStatusId"
          name="defaultStatusId"
          required
          defaultValue={tracker?.defaultStatusId ?? ""}
          className="border rounded px-3 py-2"
        >
          <option value="">{t("admin.select")}</option>
          {statuses.map((status) => (
            <option key={status.id} value={status.id}>
              {status.name}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isInRoadmap" defaultChecked={tracker?.isInRoadmap ?? true} />
        {t("admin.trackers.showInRoadmap")}
      </label>

      {/* Redmine's tracker[core_fields][]: a checked box means the field stays enabled. */}
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">{t("admin.trackers.coreFields")}</legend>
        {TRACKER_CORE_FIELDS.map((field) => (
          <label key={field} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="coreFields" value={field} defaultChecked={!disabled.has(field)} />
            {translate(locale, CORE_FIELD_LABEL_KEY[field])}
          </label>
        ))}
      </fieldset>
      {tracker ? null : (
        <div className="flex flex-col gap-1">
          <label htmlFor="copyWorkflowFrom" className="text-sm font-medium">
            {t("admin.roles.copyWorkflowFrom")}
          </label>
          <select id="copyWorkflowFrom" name="copyWorkflowFrom" defaultValue="" className="border rounded px-3 py-2">
            <option value="">{t("admin.roles.copyNone")}</option>
            {trackers.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {pending ? t("issue.saving") : tracker ? t("admin.users.saveChanges") : t("admin.trackers.add")}
      </button>
    </form>
  );
}
