"use client";

import { useActionState } from "react";
import { createIssueRelationAction, type IssueRelationActionState } from "@/interface/actions/issue-relation-actions";

const initialState: IssueRelationActionState = { error: null };

const RELATION_TYPE_OPTIONS = [
  { value: "relates", label: "関連" },
  { value: "duplicates", label: "重複する" },
  { value: "duplicated", label: "重複される" },
  { value: "blocks", label: "ブロックする" },
  { value: "blocked", label: "ブロックされる" },
  { value: "precedes", label: "先行する" },
  { value: "follows", label: "後続する" },
];

export function IssueRelationForm({ projectIdentifier, issueId }: { projectIdentifier: string; issueId: string }) {
  const [state, formAction, pending] = useActionState(createIssueRelationAction, initialState);

  return (
    <form action={formAction} className="flex items-end gap-2 flex-wrap border-t pt-3">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="issueId" value={issueId} />
      <div className="flex flex-col gap-1">
        <label htmlFor="relationType" className="text-xs font-medium">
          関係
        </label>
        <select id="relationType" name="relationType" className="border rounded px-2 py-1 text-sm">
          {RELATION_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="targetIssueId" className="text-xs font-medium">
          対象チケットID
        </label>
        <input id="targetIssueId" name="targetIssueId" required className="border rounded px-2 py-1 text-sm" />
      </div>
      {state.error ? <p role="alert" className="text-xs text-red-600 w-full">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-1 text-sm disabled:opacity-50">
        {pending ? "追加中…" : "追加"}
      </button>
    </form>
  );
}
