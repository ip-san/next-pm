"use client";

import { useActionState } from "react";
import {
  copyProjectAction,
  createProjectAction,
  type CopyProjectActionState,
  type CreateProjectActionState,
} from "@/interface/actions/project-actions";
import type { Project } from "@/domain/project/entity";
import type { Tracker } from "@/domain/tracker/entity";
import { MODULE_OPTIONS } from "../module-options";

const initialState: CreateProjectActionState | CopyProjectActionState = { error: null };

/**
 * Shared by /projects/new and /projects/[identifier]/copy — the two forms are identical
 * except for which action they submit to, whether a `sourceProjectId` hidden field is
 * present, and what the fields default to.
 */
export function ProjectForm({
  projects,
  trackers,
  copyFrom,
}: {
  projects: Project[];
  trackers: Tracker[];
  /** When set, this form copies `copyFrom`'s skeleton (members/categories/versions) into a new project instead of creating an empty one. */
  copyFrom?: Project;
}) {
  const [state, formAction, pending] = useActionState(copyFrom ? copyProjectAction : createProjectAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      {copyFrom ? <input type="hidden" name="sourceProjectId" value={copyFrom.id} /> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          名称
        </label>
        <input id="name" name="name" required defaultValue={copyFrom?.name} className="border rounded px-3 py-2" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="identifier" className="text-sm font-medium">
          識別子
        </label>
        <input id="identifier" name="identifier" required className="border rounded px-3 py-2" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium">
          概要
        </label>
        <textarea id="description" name="description" defaultValue={copyFrom?.description} className="border rounded px-3 py-2" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="parentId" className="text-sm font-medium">
          親プロジェクト
        </label>
        <select id="parentId" name="parentId" className="border rounded px-3 py-2" defaultValue={copyFrom?.parentId ?? ""}>
          <option value="">(なし)</option>
          {projects
            .filter((project) => project.id !== copyFrom?.id)
            .map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublic" defaultChecked={copyFrom ? copyFrom.isPublic : true} />
        公開プロジェクト
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">モジュール</legend>
        {MODULE_OPTIONS.map((module) => (
          <label key={module.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabledModules"
              value={module.key}
              defaultChecked={copyFrom ? copyFrom.enabledModules.includes(module.key) : module.key === "issue_tracking"}
            />
            {module.label}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">トラッカー</legend>
        {trackers.map((tracker) => (
          <label key={tracker.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="trackerIds"
              value={tracker.id}
              defaultChecked={copyFrom ? copyFrom.trackerIds.includes(tracker.id) : true}
            />
            {tracker.name}
          </label>
        ))}
      </fieldset>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {pending ? (copyFrom ? "コピー中…" : "作成中…") : copyFrom ? "プロジェクトをコピー" : "プロジェクトを作成"}
      </button>
    </form>
  );
}
