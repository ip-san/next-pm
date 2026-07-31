"use client";

import { useActionState } from "react";
import { updateVersionAction, type VersionActionState } from "@/interface/actions/version-actions";
import type { Version } from "@/domain/version/entity";

const initialState: VersionActionState = { error: null };

export function VersionEditForm({ projectIdentifier, version }: { projectIdentifier: string; version: Version }) {
  const [state, formAction, pending] = useActionState(updateVersionAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-md">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="versionId" value={version.id} />
      <input name="name" defaultValue={version.name} maxLength={60} required className="border rounded px-3 py-2 text-sm" />
      <textarea name="description" defaultValue={version.description} maxLength={255} className="border rounded px-3 py-2 text-sm" />
      <label className="text-xs text-gray-600 flex flex-col gap-1">
        期日
        <input type="date" name="effectiveDate" defaultValue={version.effectiveDate ?? ""} className="border rounded px-3 py-2 text-sm" />
      </label>
      <label className="text-xs text-gray-600 flex flex-col gap-1">
        状態
        <select name="status" defaultValue={version.status} className="border rounded px-3 py-2 text-sm">
          <option value="open">進行中</option>
          <option value="locked">ロック中</option>
          <option value="closed">終了</option>
        </select>
      </label>
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 text-sm self-start disabled:opacity-50">
        保存
      </button>
    </form>
  );
}
