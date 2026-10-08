"use client";

import { useActionState } from "react";
import { deleteProjectAction, type DeleteProjectActionState } from "@/interface/actions/project-actions";

const initialState: DeleteProjectActionState = { error: null };

/**
 * Redmine's projects/destroy confirmation: deletion is irreversible and takes every
 * subproject with it, so it is confirmed by typing the identifier rather than by an OK
 * button. The check is re-run server side — this form is only where the value is typed.
 */
export function DeleteProjectForm({ projectIdentifier }: { projectIdentifier: string }) {
  const [state, formAction, pending] = useActionState(deleteProjectAction, initialState);

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-red-600">削除</summary>
      <form action={formAction} className="flex flex-col gap-2 mt-2 max-w-md">
        <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
        <p className="text-xs text-gray-600">
          このプロジェクトとすべてのサブプロジェクト、チケット、Wiki、添付ファイルを完全に削除します。元に戻せません。 続けるには識別子{" "}
          <code className="font-mono">{projectIdentifier}</code> を入力してください。
        </p>
        <input
          name="confirmIdentifier"
          autoComplete="off"
          placeholder={projectIdentifier}
          aria-label="確認のための識別子"
          className="border rounded px-2 py-1"
        />
        {state.error ? (
          <p role="alert" className="text-xs text-red-600">
            {state.error}
          </p>
        ) : null}
        <button type="submit" disabled={pending} className="bg-red-600 text-white rounded px-3 py-1 disabled:opacity-50 self-start">
          {pending ? "削除中…" : "完全に削除する"}
        </button>
      </form>
    </details>
  );
}
