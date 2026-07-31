"use client";

import { useActionState } from "react";
import { removeMemberAction, type MemberActionState } from "@/interface/actions/member-actions";

const initialState: MemberActionState = { error: null };

export function RemoveMemberButton({ projectIdentifier, memberId }: { projectIdentifier: string; memberId: string }) {
  const [state, formAction, pending] = useActionState(removeMemberAction, initialState);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="memberId" value={memberId} />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="text-xs underline text-red-600">
        削除
      </button>
    </form>
  );
}
