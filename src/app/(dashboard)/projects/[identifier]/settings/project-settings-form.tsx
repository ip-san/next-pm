"use client";

import { useActionState } from "react";
import { updateProjectSettingsAction, type UpdateProjectSettingsActionState } from "@/interface/actions/project-actions";
import type { Project } from "@/domain/project/entity";
import type { Tracker } from "@/domain/tracker/entity";
import { MODULE_OPTIONS } from "../../module-options";

const initialState: UpdateProjectSettingsActionState = { error: null };

export function ProjectSettingsForm({ project, trackers }: { project: Project; trackers: Tracker[] }) {
  const [state, formAction, pending] = useActionState(updateProjectSettingsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      <input type="hidden" name="projectIdentifier" value={project.identifier} />
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          名称
        </label>
        <input id="name" name="name" required defaultValue={project.name} className="border rounded px-3 py-2" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium">
          概要
        </label>
        <textarea id="description" name="description" defaultValue={project.description} className="border rounded px-3 py-2" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublic" defaultChecked={project.isPublic} />
        公開プロジェクト
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">モジュール</legend>
        {MODULE_OPTIONS.map((module) => (
          <label key={module.key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabledModules" value={module.key} defaultChecked={project.enabledModules.includes(module.key)} />
            {module.label}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">トラッカー</legend>
        {trackers.map((tracker) => (
          <label key={tracker.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="trackerIds" value={tracker.id} defaultChecked={project.trackerIds.includes(tracker.id)} />
            {tracker.name}
          </label>
        ))}
      </fieldset>
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
