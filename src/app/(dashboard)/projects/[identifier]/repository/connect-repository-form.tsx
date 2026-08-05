"use client";

import { useActionState, useState } from "react";
import { connectRepositoryAction, type ConnectRepositoryActionState } from "@/interface/actions/scm-actions";

const initialState: ConnectRepositoryActionState = { error: null };

const VENDOR_LABEL = { git: "Git", subversion: "Subversion", mercurial: "Mercurial" } as const;
const VENDOR_HINT = {
  git: { label: "リポジトリのパス（サーバー上の絶対パス）", placeholder: "/var/repos/example.git" },
  mercurial: { label: "リポジトリのパス（サーバー上の絶対パス）", placeholder: "/var/repos/example-hg" },
  subversion: { label: "リポジトリのURL", placeholder: "file:///var/svn/example" },
} as const;

export function ConnectRepositoryForm({ projectIdentifier }: { projectIdentifier: string }) {
  const [state, formAction, pending] = useActionState(connectRepositoryAction, initialState);
  const [vendor, setVendor] = useState<keyof typeof VENDOR_HINT>("git");
  const hint = VENDOR_HINT[vendor];

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-md">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <label htmlFor="vendor" className="text-sm font-medium">
        種類
      </label>
      <select
        id="vendor"
        name="vendor"
        value={vendor}
        onChange={(e) => setVendor(e.target.value as keyof typeof VENDOR_HINT)}
        className="border rounded px-3 py-2 text-sm"
      >
        {Object.entries(VENDOR_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <label htmlFor="rootPath" className="text-sm font-medium">
        {hint.label}
      </label>
      <input id="rootPath" name="rootPath" placeholder={hint.placeholder} required className="border rounded px-3 py-2 text-sm" />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 text-sm self-start disabled:opacity-50">
        接続
      </button>
    </form>
  );
}
