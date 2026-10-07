"use client";

import { useActionState } from "react";
import { addProjectFileAction, type FileActionState } from "@/interface/actions/file-actions";

const initialState: FileActionState = { error: null };

export function FileUploadForm({
  projectIdentifier,
  versions,
}: {
  projectIdentifier: string;
  versions: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(addProjectFileAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-md border-t pt-4">
      <h2 className="font-medium text-sm">ファイルを追加</h2>
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      {versions.length > 0 ? (
        <label className="flex flex-col gap-1 text-sm">
          バージョン
          <select name="versionId" defaultValue="" className="border rounded px-3 py-2 text-sm">
            <option value="">（プロジェクト全体）</option>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <input name="description" placeholder="説明" maxLength={255} className="border rounded px-3 py-2 text-sm" />
      <input type="file" name="file" required className="text-sm" />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 text-sm self-start disabled:opacity-50">
        {pending ? "アップロード中…" : "追加"}
      </button>
    </form>
  );
}
