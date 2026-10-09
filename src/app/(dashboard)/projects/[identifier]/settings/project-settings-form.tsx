"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { updateProjectSettingsAction, type UpdateProjectSettingsActionState } from "@/interface/actions/project-actions";
import type { CustomField } from "@/domain/custom-field/entity";
import { CustomFieldValueInput } from "@/interface/components/custom-field-value-input";
import type { Project } from "@/domain/project/entity";
import type { Tracker } from "@/domain/tracker/entity";
import { MODULE_OPTIONS } from "../../module-options";

const initialState: UpdateProjectSettingsActionState = { error: null };


export function ProjectSettingsForm({
  project,
  trackers,
  customFields,
  customValueByFieldId,
  showPublicity = true,
  showModules = true,
  locale = "ja",
}: {
  project: Project;
  trackers: Tracker[];
  customFields: CustomField[];
  customValueByFieldId: Record<string, string | null>;
  /** False without select_project_publicity — the server keeps the stored value either way. */
  showPublicity?: boolean;
  /** False without select_project_modules. */
  showModules?: boolean;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(updateProjectSettingsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      <input type="hidden" name="projectIdentifier" value={project.identifier} />
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          {t("projectSettings.name")}
        </label>
        <input id="name" name="name" required defaultValue={project.name} className="border rounded px-3 py-2" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium">
          {t("projectSettings.description")}
        </label>
        <textarea id="description" name="description" defaultValue={project.description} className="border rounded px-3 py-2" />
      </div>
      {showPublicity ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isPublic" defaultChecked={project.isPublic} />
          {t("projectSettings.isPublic")}
        </label>
      ) : null}
      {showModules ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium">{t("projectSettings.modules")}</legend>
          {MODULE_OPTIONS.map((module) => (
            <label key={module.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabledModules" value={module.key} defaultChecked={project.enabledModules.includes(module.key)} />
              {translate(locale, module.labelKey)}
            </label>
          ))}
        </fieldset>
      ) : null}
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">{t("projectSettings.trackers")}</legend>
        {trackers.map((tracker) => (
          <label key={tracker.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="trackerIds" value={tracker.id} defaultChecked={project.trackerIds.includes(tracker.id)} />
            {tracker.name}
          </label>
        ))}
      </fieldset>
      {customFields.length > 0 ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">{t("projectSettings.customFields")}</legend>
          {customFields.map((field) => (
            <div key={field.id} className="flex flex-col gap-1">
              <input type="hidden" name="customFieldIds" value={field.id} />
              <label htmlFor={`customField-${field.id}`} className="text-sm font-medium">
                {field.name}
                {field.isRequired ? <span className="text-red-600"> *</span> : null}
              </label>
              <CustomFieldValueInput field={field} defaultValue={customValueByFieldId[field.id] ?? null} />
            </div>
          ))}
        </fieldset>
      ) : null}
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
