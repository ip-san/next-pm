"use client";

import { useActionState } from "react";
import { linkChangesetIssueAction, unlinkChangesetIssueAction, type ScmActionState } from "@/interface/actions/scm-actions";

const initialState: ScmActionState = { error: null };

/** Redmine's `_related_issues` add form (`#new-relation-form`), gated by manage_related_issues. */
export function LinkRelatedIssueForm({
  projectIdentifier,
  repositoryParam,
  revision,
}: {
  projectIdentifier: string;
  repositoryParam: string;
  revision: string;
}) {
  const [state, formAction, pending] = useActionState(linkChangesetIssueAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="repositoryParam" value={repositoryParam} />
      <input type="hidden" name="revision" value={revision} />
      <label htmlFor="issueRef" className="text-sm">
        チケットを関連付ける
      </label>
      <input id="issueRef" name="issueRef" required placeholder="#eb0b2d1a" className="border rounded px-2 py-1 text-sm font-mono" />
      <button type="submit" disabled={pending} className="border rounded px-2 py-1 text-sm disabled:opacity-50">
        追加
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

export function UnlinkRelatedIssueForm({
  projectIdentifier,
  repositoryParam,
  revision,
  issueId,
}: {
  projectIdentifier: string;
  repositoryParam: string;
  revision: string;
  issueId: string;
}) {
  const [state, formAction, pending] = useActionState(unlinkChangesetIssueAction, initialState);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="repositoryParam" value={repositoryParam} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="issueId" value={issueId} />
      <button type="submit" disabled={pending} className="text-xs underline text-red-700 disabled:opacity-50">
        関連を解除
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
