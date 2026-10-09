"use client";

import { useActionState } from "react";
import { createIssueRelationAction, type IssueRelationActionState } from "@/interface/actions/issue-relation-actions";
import { IssueAutocomplete } from "../issue-autocomplete";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: IssueRelationActionState = { error: null };

const RELATION_TYPE_OPTIONS: { value: string; key: MessageKey }[] = [
  { value: "relates", key: "issue.relation.relates" },
  { value: "duplicates", key: "issue.relation.duplicates" },
  { value: "duplicated", key: "issue.relation.duplicated" },
  { value: "blocks", key: "issue.relation.blocks" },
  { value: "blocked", key: "issue.relation.blocked" },
  { value: "precedes", key: "issue.relation.precedes" },
  { value: "follows", key: "issue.relation.follows" },
];

export function IssueRelationForm({ projectIdentifier, issueId, locale }: { projectIdentifier: string; issueId: string; locale: Locale }) {
  const [state, formAction, pending] = useActionState(createIssueRelationAction, initialState);
  const t = (key: MessageKey) => translate(locale, key);

  return (
    <form action={formAction} className="flex items-end gap-2 flex-wrap border-t pt-3">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="issueId" value={issueId} />
      <div className="flex flex-col gap-1">
        <label htmlFor="relationType" className="text-xs font-medium">
          {t("issue.relationType")}
        </label>
        <select id="relationType" name="relationType" className="border rounded px-2 py-1 text-sm">
          {RELATION_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.key)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1 min-w-64">
        <label htmlFor="targetIssueId" className="text-xs font-medium">
          {t("issue.targetIssue")}
        </label>
        <IssueAutocomplete projectIdentifier={projectIdentifier} inputId="targetIssueId" inputName="targetIssueId" onSelect={() => {}} />
      </div>
      {state.error ? <p role="alert" className="text-xs text-red-600 w-full">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-1 text-sm disabled:opacity-50">
        {pending ? t("issue.adding") : t("issue.add")}
      </button>
    </form>
  );
}
