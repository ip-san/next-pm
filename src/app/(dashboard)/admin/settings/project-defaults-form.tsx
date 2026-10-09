"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { updateProjectDefaultsAction, type SettingsActionState } from "@/interface/actions/settings-actions";
import type { ProjectDefaults } from "@/domain/settings/project-defaults";
import type { Role } from "@/domain/role/entity";
import type { Tracker } from "@/domain/tracker/entity";
import { MODULE_OPTIONS } from "../../projects/module-options";

const initialState: SettingsActionState = { error: null };

export function ProjectDefaultsForm({
  settings,
  trackers,
  roles,
  locale = "ja",
}: {
  settings: ProjectDefaults;
  trackers: Tracker[];
  /** Assignable roles — Redmine offers only Role.givable for new_project_user_role_id. */
  roles: Role[];
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(updateProjectDefaultsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublic" defaultChecked={settings.isPublic} />
        {t("admin.projectDefaults.isPublic")}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="sequentialIdentifiers" defaultChecked={settings.sequentialIdentifiers} />
        {t("admin.projectDefaults.sequential")}
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">{t("admin.projectDefaults.modules")}</legend>
        {MODULE_OPTIONS.map((module) => (
          <label key={module.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabledModules"
              value={module.key}
              defaultChecked={(settings.enabledModules as string[]).includes(module.key)}
            />
            {translate(locale, module.labelKey)}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">{t("admin.projectDefaults.trackers")}</legend>
        {/* Nothing checked means "every tracker", which is also what an unset setting does
            — the hidden marker below is what tells the two apart on submit. */}
        <input type="hidden" name="trackerSelectionSubmitted" value="1" />
        {trackers.map((tracker) => (
          <label key={tracker.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="trackerIds"
              value={tracker.id}
              defaultChecked={settings.trackerIds === null || settings.trackerIds.includes(tracker.id)}
            />
            {tracker.name}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        {t("admin.projectDefaults.newProjectRole")}
        <select name="newProjectUserRoleId" defaultValue={settings.newProjectUserRoleId ?? ""} className="border rounded px-2 py-1">
          <option value="">{t("admin.projectDefaults.firstRole")}</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </label>

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
