"use client";

import { useActionState } from "react";
import { updateVersionAction, type VersionActionState } from "@/interface/actions/version-actions";
import type { Version } from "@/domain/version/entity";
import type { CustomField } from "@/domain/custom-field/entity";
import { CustomFieldValueInput } from "@/interface/components/custom-field-value-input";

const initialState: VersionActionState = { error: null };

export function VersionEditForm({
  projectIdentifier,
  version,
  customFields,
  customValueByFieldId,
}: {
  projectIdentifier: string;
  version: Version;
  customFields: CustomField[];
  customValueByFieldId: Record<string, string | null>;
}) {
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
      <label className="text-xs text-gray-600 flex flex-col gap-1">
        共有
        <select name="sharing" defaultValue={version.sharing} className="border rounded px-3 py-2 text-sm">
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
          <CustomFieldValueInput field={field} defaultValue={customValueByFieldId[field.id] ?? null} />
        </div>
      ))}
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 text-sm self-start disabled:opacity-50">
        保存
      </button>
    </form>
  );
}
