"use client";

import { useActionState } from "react";
import { deleteIssueRelationAction, type IssueRelationActionState } from "@/interface/actions/issue-relation-actions";

const initialState: IssueRelationActionState = { error: null };

export function DeleteIssueRelationButton({
  projectIdentifier,
  issueId,
  relationId,
}: {
  projectIdentifier: string;
  issueId: string;
  relationId: string;
}) {
  const [state, formAction, pending] = useActionState(deleteIssueRelationAction, initialState);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="issueId" value={issueId} />
      <input type="hidden" name="relationId" value={relationId} />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="text-xs underline text-red-600">
        削除
      </button>
    </form>
  );
}
