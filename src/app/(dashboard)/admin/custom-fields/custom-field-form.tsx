"use client";

import { useActionState } from "react";
import { createCustomFieldAction, type AdminActionState } from "@/interface/actions/admin-actions";
import type { Tracker } from "@/domain/tracker/entity";

const initialState: AdminActionState = { error: null };

const FORMAT_OPTIONS = [
  { value: "string", label: "文字列" },
  { value: "text", label: "テキスト" },
  { value: "int", label: "整数" },
  { value: "float", label: "浮動小数点" },
  { value: "date", label: "日付" },
  { value: "bool", label: "真偽値" },
  { value: "list", label: "リスト" },
] as const;

export function CustomFieldForm({ trackers }: { trackers: Tracker[] }) {
  const [state, formAction, pending] = useActionState(createCustomFieldAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-md border-t pt-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          名称
        </label>
        <input id="name" name="name" required maxLength={30} className="border rounded px-3 py-2" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="fieldFormat" className="text-sm font-medium">
          形式
        </label>
        <select id="fieldFormat" name="fieldFormat" required className="border rounded px-3 py-2">
          {FORMAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="possibleValues" className="text-sm font-medium">
          選択肢（形式が「リスト」の場合、カンマ区切り）
        </label>
        <input id="possibleValues" name="possibleValues" className="border rounded px-3 py-2" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="defaultValue" className="text-sm font-medium">
          既定値
        </label>
        <input id="defaultValue" name="defaultValue" className="border rounded px-3 py-2" />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isRequired" />
        必須項目
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">対象トラッカー</legend>
        {trackers.map((tracker) => (
          <label key={tracker.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="trackerIds" value={tracker.id} />
            {tracker.name}
          </label>
        ))}
      </fieldset>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? "追加中…" : "カスタムフィールドを追加"}
      </button>
    </form>
  );
}
