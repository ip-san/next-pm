"use client";

import Link from "next/link";
import { useActionState } from "react";
import { deleteWikiPageAction, type WikiPageActionState } from "@/interface/actions/wiki-page-actions";

const initialState: WikiPageActionState = { error: null };

export interface ReassignCandidate {
  id: string;
  title: string;
}

export function WikiDestroyForm({
  pageId,
  projectIdentifier,
  title,
  descendantCount,
  reassignCandidates,
}: {
  pageId: string;
  projectIdentifier: string;
  title: string;
  descendantCount: number;
  reassignCandidates: ReassignCandidate[];
}) {
  const [state, formAction, pending] = useActionState(deleteWikiPageAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 text-sm">
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />

      {descendantCount > 0 ? (
        <fieldset className="border rounded p-3 flex flex-col gap-2">
          <legend className="px-1 font-medium">
            このページには {descendantCount} 件の子ページがあります。どうしますか?
          </legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="childrenDisposition" value="nullify" defaultChecked />
            子ページをトップレベルに移動する
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="childrenDisposition" value="destroy" />
            子ページもすべて削除する
          </label>
          {reassignCandidates.length > 0 ? (
            <label className="flex items-center gap-2">
              <input type="radio" name="childrenDisposition" value="reassign" />
              子ページを別のページの下に移動する
              <select name="reassignToId" defaultValue="" className="border rounded px-2 py-1">
                <option value="" disabled>
                  ページを選択
                </option>
                {reassignCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </fieldset>
      ) : (
        <input type="hidden" name="childrenDisposition" value="nullify" />
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="bg-red-600 text-white rounded px-3 py-2 disabled:opacity-50">
          削除する
        </button>
        <Link href={`/projects/${projectIdentifier}/wiki/${encodeURIComponent(title)}`} className="underline">
          キャンセル
        </Link>
      </div>
      {state.error ? (
        <p role="alert" className="text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
