"use client";

import { useActionState } from "react";
import { toggleJournalReactionAction, type ToggleReactionActionState } from "@/interface/actions/reaction-actions";

const initialState: ToggleReactionActionState = { error: null };

export function ReactionButton({
  journalId,
  issueId,
  projectIdentifier,
  count,
  reacted,
}: {
  journalId: string;
  issueId: string;
  projectIdentifier: string;
  count: number;
  reacted: boolean;
}) {
  const [state, formAction, pending] = useActionState(toggleJournalReactionAction, initialState);

  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="journalId" value={journalId} />
      <input type="hidden" name="issueId" value={issueId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={reacted}
        className={`text-xs rounded-full border px-2 py-0.5 disabled:opacity-50 ${reacted ? "bg-black text-white" : "bg-white text-gray-700"}`}
      >
        👍 {count > 0 ? count : ""}
      </button>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
