"use client";

import { useActionState } from "react";
import { deleteIssueRelationAction, type IssueRelationActionState } from "@/interface/actions/issue-relation-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: IssueRelationActionState = { error: null };

export function DeleteIssueRelationButton({
  projectIdentifier,
  issueId,
  relationId,
  locale,
}: {
  projectIdentifier: string;
  issueId: string;
  relationId: string;
  locale: Locale;
}) {
  const [state, formAction, pending] = useActionState(deleteIssueRelationAction, initialState);
  const t = (key: MessageKey) => translate(locale, key);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="issueId" value={issueId} />
      <input type="hidden" name="relationId" value={relationId} />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="text-xs underline text-red-600">
        {t("issue.delete")}
      </button>
    </form>
  );
}
