"use client";

import { useActionState } from "react";
import { deleteVersionAction, type VersionActionState } from "@/interface/actions/version-actions";

const initialState: VersionActionState = { error: null };

export function DeleteVersionButton({ projectIdentifier, versionId }: { projectIdentifier: string; versionId: string }) {
  const [state, formAction, pending] = useActionState(deleteVersionAction, initialState);

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="versionId" value={versionId} />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="text-xs underline text-red-600">
        削除
      </button>
    </form>
  );
}
