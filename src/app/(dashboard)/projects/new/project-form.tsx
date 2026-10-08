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

/** What a brand-new project starts out as, from the `default_projects_*` admin settings. */
export interface NewProjectDefaults {
  isPublic: boolean;
  enabledModules: string[];
  /** null means "every tracker", matching Project#initialize's fallback. */
  trackerIds: string[] | null;
  /** Pre-filled identifier when `sequential_project_identifiers` is on. */
  identifier: string | null;
}

/**
 * Shared by /projects/new and /projects/[identifier]/copy — the two forms are identical
 * except for which action they submit to, whether a `sourceProjectId` hidden field is
 * present, and what the fields default to.
 */
export function ProjectForm({
  projects,
  trackers,
  copyFrom,
  defaults,
  allowNoParent = true,
  showPublicity = true,
  showModules = true,
}: {
  /** Projects offerable as the parent — on /projects/new, only those the user holds add_subprojects on. */
  projects: Project[];
  trackers: Tracker[];
  /** When set, this form copies `copyFrom`'s skeleton (members/categories/versions) into a new project instead of creating an empty one. */
  copyFrom?: Project;
  defaults?: NewProjectDefaults;
  /** False when the user may only create subprojects (no global add_project). */
  allowNoParent?: boolean;
  /** False when the creator's role lacks select_project_publicity — the server then uses the default. */
  showPublicity?: boolean;
  /** False when the creator's role lacks select_project_modules. */
  showModules?: boolean;
}) {
  const [state, formAction, pending] = useActionState(copyFrom ? copyProjectAction : createProjectAction, initialState);

  const moduleChecked = (key: string) =>
    copyFrom ? copyFrom.enabledModules.includes(key) : (defaults?.enabledModules ?? ["issue_tracking"]).includes(key);
  const trackerChecked = (id: string) => {
    if (copyFrom) return copyFrom.trackerIds.includes(id);
    const defaultTrackerIds = defaults?.trackerIds;
    return defaultTrackerIds == null || defaultTrackerIds.includes(id);
  };

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
        <input id="identifier" name="identifier" required defaultValue={defaults?.identifier ?? ""} className="border rounded px-3 py-2" />
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
        <select
          id="parentId"
          name="parentId"
          required={!allowNoParent}
          className="border rounded px-3 py-2"
          defaultValue={copyFrom?.parentId ?? ""}
        >
          {/* Redmine's Project#allowed_parents only offers "no parent" to someone who may
              create a root project; without add_project a parent must be chosen. */}
          {allowNoParent ? <option value="">(なし)</option> : <option value="">選択してください</option>}
          {projects
            .filter((project) => project.id !== copyFrom?.id)
            .map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
        </select>
      </div>
      {showPublicity ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isPublic" defaultChecked={copyFrom ? copyFrom.isPublic : (defaults?.isPublic ?? true)} />
          公開プロジェクト
        </label>
      ) : null}
      {showModules ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium">モジュール</legend>
          {MODULE_OPTIONS.map((module) => (
            <label key={module.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabledModules" value={module.key} defaultChecked={moduleChecked(module.key)} />
              {module.label}
            </label>
          ))}
        </fieldset>
      ) : null}
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">トラッカー</legend>
        {trackers.map((tracker) => (
          <label key={tracker.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="trackerIds" value={tracker.id} defaultChecked={trackerChecked(tracker.id)} />
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
