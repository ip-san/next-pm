"use client";

import { useActionState } from "react";
import {
  archiveProjectAction,
  closeProjectAction,
  reopenProjectAction,
  unarchiveProjectAction,
  type ProjectStatusActionState,
} from "@/interface/actions/project-actions";

const initialState: ProjectStatusActionState = { error: null };

const TRANSITIONS = {
  archive: { action: archiveProjectAction, label: "アーカイブ" },
  unarchive: { action: unarchiveProjectAction, label: "アーカイブ解除" },
  close: { action: closeProjectAction, label: "閉鎖" },
  reopen: { action: reopenProjectAction, label: "再開" },
} as const;

export type ProjectStatusTransition = keyof typeof TRANSITIONS;

/**
 * One button per status transition (Redmine's project action menu). Archive and close both
 * cascade to the whole subtree, so the confirmation says so rather than naming one project.
 */
export function ProjectStatusButton({
  projectIdentifier,
  transition,
}: {
  projectIdentifier: string;
  transition: ProjectStatusTransition;
}) {
  const { action, label } = TRANSITIONS[transition];
  const [state, formAction, pending] = useActionState(action, initialState);
  const cascades = transition === "archive" || transition === "close";

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <button
        type="submit"
        disabled={pending}
        className="text-sm underline disabled:opacity-50"
        onClick={(event) => {
          if (cascades && !window.confirm(`このプロジェクトとすべてのサブプロジェクトを${label}します。よろしいですか？`)) {
            event.preventDefault();
          }
        }}
      >
        {label}
      </button>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
