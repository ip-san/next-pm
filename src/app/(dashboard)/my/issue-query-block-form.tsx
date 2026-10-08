"use client";

import { useActionState } from "react";
import { setIssueQueryBlockQueryAction, type MyPageActionState } from "@/interface/actions/my-page-actions";

const initialState: MyPageActionState = { error: null };

/** Picks the saved query an issue-query block shows. */
export function IssueQueryBlockForm({
  block,
  queries,
  selectedId,
}: {
  block: string;
  queries: { id: string; name: string }[];
  selectedId: string | null;
}) {
  const [state, formAction, pending] = useActionState(setIssueQueryBlockQueryAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2 text-xs text-gray-500">
      <input type="hidden" name="block" value={block} />
      <select name="queryId" defaultValue={selectedId ?? ""} className="border rounded px-1 py-0.5" required>
        <option value="" disabled>
          クエリを選ぶ
        </option>
        {queries.map((query) => (
          <option key={query.id} value={query.id}>
            {query.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="underline">
        表示する
      </button>
      {state.error ? <span className="text-red-600">{state.error}</span> : null}
    </form>
  );
}
