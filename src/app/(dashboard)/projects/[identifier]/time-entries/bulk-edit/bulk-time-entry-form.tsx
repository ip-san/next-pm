"use client";

import { useActionState } from "react";
import { bulkUpdateTimeEntriesAction, type BulkTimeEntryActionState } from "@/interface/actions/time-entry-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import type { CustomField } from "@/domain/custom-field/entity";

const initialState: BulkTimeEntryActionState = { error: null, message: null };

/**
 * Redmine's timelog bulk edit: project, issue, user, activity, hours, date, comments and custom fields. A blank field
 * leaves the attribute alone; "(none)" clears an issue or a custom field.
 */
export function BulkTimeEntryForm({
  projectIdentifier,
  entryIds,
  activities,
  projects,
  users,
  customFields,
  locale = "ja",
}: {
  projectIdentifier: string;
  entryIds: string[];
  activities: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  users: { id: string; name: string }[];
  customFields: CustomField[];
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(bulkUpdateTimeEntriesAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-sm">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      {entryIds.map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}

      <div className="flex flex-col gap-1">
        <label htmlFor="bulk-project" className="text-sm font-medium">
          {t("bulkEdit.project")}
        </label>
        <select id="bulk-project" name="targetProjectId" defaultValue="" className="border rounded px-3 py-2">
          <option value="">{t("bulkEdit.noChange")}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="bulk-issue" className="text-sm font-medium">
          {t("bulkEdit.issue")}
        </label>
        <input id="bulk-issue" name="issue" placeholder={t("bulkEdit.issueHint")} className="border rounded px-3 py-2" />
      </div>

      {users.length > 0 ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="bulk-user" className="text-sm font-medium">
            {t("bulkEdit.user")}
          </label>
          <select id="bulk-user" name="userId" defaultValue="" className="border rounded px-3 py-2">
            <option value="">{t("bulkEdit.noChange")}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="bulk-activity" className="text-sm font-medium">
          {t("issue.activity")}
        </label>
        <select id="bulk-activity" name="activityId" defaultValue="" className="border rounded px-3 py-2">
          <option value="">{t("bulkEdit.noChange")}</option>
          {activities.map((activity) => (
            <option key={activity.id} value={activity.id}>
              {activity.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="bulk-hours" className="text-sm font-medium">
          {t("bulkEdit.hours")}
        </label>
        <input id="bulk-hours" name="hours" type="number" min="0.01" step="any" className="border rounded px-3 py-2" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="bulk-spent-on" className="text-sm font-medium">
          {t("bulkEdit.spentOn")}
        </label>
        <input id="bulk-spent-on" name="spentOn" type="date" className="border rounded px-3 py-2" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="bulk-comments" className="text-sm font-medium">
          {t("bulkEdit.comments")}
        </label>
        <textarea id="bulk-comments" name="comments" rows={2} className="border rounded px-3 py-2" />
      </div>

      {customFields.map((field) => (
        <div key={field.id} className="flex flex-col gap-1">
          <label htmlFor={`bulk-cf-${field.id}`} className="text-sm font-medium">
            {field.name}
          </label>
          {field.fieldFormat === "list" || field.fieldFormat === "bool" ? (
            <select id={`bulk-cf-${field.id}`} name={`cf_${field.id}`} defaultValue="" className="border rounded px-3 py-2">
              <option value="">{t("bulkEdit.noChange")}</option>
              {field.isRequired ? null : <option value="__none__">{t("bulkEdit.none")}</option>}
              {(field.fieldFormat === "bool" ? ["1", "0"] : field.possibleValues).map((value) => (
                <option key={value} value={value}>
                  {field.fieldFormat === "bool" ? t(value === "1" ? "issue.yes" : "issue.no") : value}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`bulk-cf-${field.id}`}
              name={`cf_${field.id}`}
              type={field.fieldFormat === "date" ? "date" : "text"}
              placeholder={t("bulkEdit.noChange")}
              className="border rounded px-3 py-2"
            />
          )}
        </div>
      ))}

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.message ? <p className="text-sm text-green-700">{state.message}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? t("bulkEdit.submitting") : t("bulkEdit.submit")}
      </button>
    </form>
  );
}
