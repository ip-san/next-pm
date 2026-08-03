"use client";

import { useActionState } from "react";
import { importIssuesCsvAction, type ImportIssuesActionState } from "@/interface/actions/issue-import-actions";

const initialState: ImportIssuesActionState = { error: null, summary: null };

export function ImportForm({
  projectIdentifier,
  canManageCategories,
  canManageVersions,
}: {
  projectIdentifier: string;
  canManageCategories: boolean;
  canManageVersions: boolean;
}) {
  const [state, formAction, pending] = useActionState(importIssuesCsvAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-lg">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <div className="flex flex-col gap-1">
        <label htmlFor="file" className="text-sm font-medium">
          CSVファイル
        </label>
        <input id="file" name="file" type="file" accept=".csv,text/csv" required className="border rounded px-3 py-2 text-sm" />
      </div>
      {canManageCategories ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="createCategories" />
          存在しないカテゴリを作成する
        </label>
      ) : null}
      {canManageVersions ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="createVersions" />
          存在しないバージョンを作成する
        </label>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? "取り込み中…" : "取り込み"}
      </button>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.summary ? (
        <div className="text-sm flex flex-col gap-1">
          <p className="text-green-700">
            {state.summary.created}件作成しました。{state.summary.failed > 0 ? `（${state.summary.failed}件失敗）` : ""}
          </p>
          {state.summary.rowErrors.length > 0 ? (
            <ul className="text-red-600 text-xs flex flex-col gap-0.5">
              {state.summary.rowErrors.map((rowError) => (
                <li key={rowError}>{rowError}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
