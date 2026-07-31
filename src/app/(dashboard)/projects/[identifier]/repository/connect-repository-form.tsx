"use client";

import { useActionState } from "react";
import { connectRepositoryAction, type ConnectRepositoryActionState } from "@/interface/actions/scm-actions";

const initialState: ConnectRepositoryActionState = { error: null };

export function ConnectRepositoryForm({ projectIdentifier }: { projectIdentifier: string }) {
  const [state, formAction, pending] = useActionState(connectRepositoryAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-md">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <label htmlFor="rootPath" className="text-sm font-medium">
        リポジトリのパス（サーバー上の絶対パス）
      </label>
      <input id="rootPath" name="rootPath" placeholder="/var/repos/example.git" required className="border rounded px-3 py-2 text-sm" />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 text-sm self-start disabled:opacity-50">
        接続
      </button>
    </form>
  );
}
