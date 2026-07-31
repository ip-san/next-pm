"use client";

import { useActionState } from "react";
import { saveQueryAction, type SaveQueryActionState } from "@/interface/actions/query-actions";
import type { FilterCondition } from "@/domain/query/filter-builder";

const initialState: SaveQueryActionState = { error: null };

export function SaveQueryForm({
  projectIdentifier,
  filters,
  canPublish,
}: {
  projectIdentifier: string;
  filters: FilterCondition[];
  canPublish: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveQueryAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2 text-sm">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="filters" value={JSON.stringify(filters)} />
      <label htmlFor="query-name" className="text-gray-500">
        現在の絞り込みを保存:
      </label>
      <input id="query-name" name="name" required placeholder="クエリ名" className="border rounded px-2 py-1" />
      <select name="visibility" defaultValue="private" className="border rounded px-2 py-1">
        <option value="private">自分のみ</option>
        {canPublish ? <option value="public">全員に公開</option> : null}
      </select>
      <button type="submit" disabled={pending} className="border rounded px-2 py-1 disabled:opacity-50">
        {pending ? "保存中…" : "保存"}
      </button>
      {state.error ? (
        <span role="alert" className="text-red-600">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
