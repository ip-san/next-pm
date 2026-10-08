"use client";

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
}: {
  settings: ProjectDefaults;
  trackers: Tracker[];
  /** Assignable roles — Redmine offers only Role.givable for new_project_user_role_id. */
  roles: Role[];
}) {
  const [state, formAction, pending] = useActionState(updateProjectDefaultsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublic" defaultChecked={settings.isPublic} />
        新しいプロジェクトを既定で公開にする
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="sequentialIdentifiers" defaultChecked={settings.sequentialIdentifiers} />
        識別子を連番で生成する
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">既定で有効にするモジュール</legend>
        {MODULE_OPTIONS.map((module) => (
          <label key={module.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabledModules"
              value={module.key}
              defaultChecked={(settings.enabledModules as string[]).includes(module.key)}
            />
            {module.label}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">既定で有効にするトラッカー</legend>
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
        プロジェクトを作成した非管理者に与えるロール
        <select name="newProjectUserRoleId" defaultValue={settings.newProjectUserRoleId ?? ""} className="border rounded px-2 py-1">
          <option value="">(最初のロール)</option>
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
        {pending ? "保存中…" : "保存"}
      </button>
    </form>
  );
}
