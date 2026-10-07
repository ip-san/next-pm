"use client";

import { useActionState } from "react";
import {
  deleteProjectWikiAction,
  updateWikiStartPageAction,
  type WikiPageActionState,
} from "@/interface/actions/wiki-page-actions";

const initialState: WikiPageActionState = { error: null };

export function WikiStartPageForm({
  projectId,
  projectIdentifier,
  startPage,
}: {
  projectId: string;
  projectIdentifier: string;
  startPage: string;
}) {
  const [state, formAction, pending] = useActionState(updateWikiStartPageAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-md">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <div className="flex flex-col gap-1">
        <label htmlFor="startPage" className="text-sm font-medium">
          開始ページ
        </label>
        <input id="startPage" name="startPage" defaultValue={startPage} className="border rounded px-3 py-2" />
        <p className="text-xs text-gray-500">プロジェクトの Wiki を開いたときに最初に表示されるページ名です。</p>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? "保存中…" : "保存"}
      </button>
    </form>
  );
}

export function DeleteProjectWikiForm({
  projectId,
  projectIdentifier,
  pageCount,
}: {
  projectId: string;
  projectIdentifier: string;
  pageCount: number;
}) {
  const [state, formAction, pending] = useActionState(deleteProjectWikiAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-md">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <p className="text-sm">
        このプロジェクトの Wiki ページ {pageCount} 件とその版歴・添付ファイルをすべて削除します。元に戻せません。
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirm" />
        削除してよいことを確認しました
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-red-600 text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? "削除中…" : "Wiki を削除"}
      </button>
    </form>
  );
}
