"use client";

import { useActionState } from "react";
import { setWikiPageProtectionAction, type WikiPageActionState } from "@/interface/actions/wiki-page-actions";

const initialState: WikiPageActionState = { error: null };

export function WikiProtectToggleForm({
  pageId,
  projectIdentifier,
  title,
  isProtected,
}: {
  pageId: string;
  projectIdentifier: string;
  title: string;
  isProtected: boolean;
}) {
  const [state, formAction, pending] = useActionState(setWikiPageProtectionAction, initialState);

  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="isProtected" value={isProtected ? "0" : "1"} />
      <button type="submit" disabled={pending} className="text-sm underline disabled:opacity-50">
        {isProtected ? "保護を解除" : "保護する"}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
