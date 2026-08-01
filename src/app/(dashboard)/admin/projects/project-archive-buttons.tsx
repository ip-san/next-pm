"use client";

import { useActionState } from "react";
import {
  archiveProjectAction,
  unarchiveProjectAction,
  type ProjectLifecycleActionState,
} from "@/interface/actions/project-actions";

const initialState: ProjectLifecycleActionState = { error: null };

export function ProjectArchiveButtons({ projectId, isArchived }: { projectId: string; isArchived: boolean }) {
  const [state, formAction, pending] = useActionState(isArchived ? unarchiveProjectAction : archiveProjectAction, initialState);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="projectId" value={projectId} />
      <button type="submit" disabled={pending} className="text-xs underline disabled:opacity-50">
        {isArchived ? "アーカイブ解除" : "アーカイブ"}
      </button>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
