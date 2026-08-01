"use client";

import { useActionState } from "react";
import {
  closeProjectAction,
  reopenProjectAction,
  type ProjectLifecycleActionState,
} from "@/interface/actions/project-actions";

const initialState: ProjectLifecycleActionState = { error: null };

/** Close/reopen for holders of close_project — Redmine's project actions menu. */
export function ProjectLifecycleActions({ projectIdentifier, isClosed }: { projectIdentifier: string; isClosed: boolean }) {
  const [state, formAction, pending] = useActionState(isClosed ? reopenProjectAction : closeProjectAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <button type="submit" disabled={pending} className="text-sm underline disabled:opacity-50">
        {isClosed ? "プロジェクトを再オープン" : "プロジェクトをクローズ"}
      </button>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
