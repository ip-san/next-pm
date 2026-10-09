"use client";

import { useActionState } from "react";
import { createVersionAction, type VersionActionState } from "@/interface/actions/version-actions";
import type { CustomField } from "@/domain/custom-field/entity";
import { CustomFieldValueInput } from "@/interface/components/custom-field-value-input";

const initialState: VersionActionState = { error: null };

export function VersionCreateForm({ projectIdentifier, customFields }: { projectIdentifier: string; customFields: CustomField[] }) {
  const [state, formAction, pending] = useActionState(createVersionAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-md border-t pt-4">
      <h2 className="font-medium text-sm">バージョンを作成</h2>
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input name="name" placeholder="名前" maxLength={60} required className="border rounded px-3 py-2 text-sm" />
      <textarea name="description" placeholder="説明" maxLength={255} className="border rounded px-3 py-2 text-sm" />
      <label className="text-xs text-gray-600 flex flex-col gap-1">
        期日
        <input type="date" name="effectiveDate" className="border rounded px-3 py-2 text-sm" />
      </label>
      <label className="text-xs text-gray-600 flex flex-col gap-1">
        共有
        <select name="sharing" defaultValue="none" className="border rounded px-3 py-2 text-sm">
          <option value="none">共有しない</option>
          <option value="descendants">サブプロジェクト</option>
          <option value="hierarchy">プロジェクト階層</option>
          <option value="tree">プロジェクトツリー</option>
          <option value="system">全プロジェクト</option>
        </select>
      </label>
      {customFields.map((field) => (
        <div key={field.id} className="flex flex-col gap-1 text-xs text-gray-600">
          <input type="hidden" name="customFieldIds" value={field.id} />
          <label htmlFor={`customField-${field.id}`}>{field.name}</label>
          <CustomFieldValueInput field={field} defaultValue={null} />
        </div>
      ))}
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 text-sm self-start disabled:opacity-50">
        作成
      </button>
    </form>
  );
}
