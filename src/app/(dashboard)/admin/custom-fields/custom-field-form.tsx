"use client";

import { useActionState, useState } from "react";
import { createCustomFieldAction, updateCustomFieldAction } from "@/interface/actions/admin-custom-field-actions";
import type { AdminActionState } from "@/interface/actions/admin-action-state";
import type { Tracker } from "@/domain/tracker/entity";
import type { CustomField, CustomizedType } from "@/domain/custom-field/entity";

const initialState: AdminActionState = { error: null };

const FORMAT_OPTIONS = [
  { value: "string", label: "文字列" },
  { value: "text", label: "テキスト" },
  { value: "int", label: "整数" },
  { value: "float", label: "浮動小数点" },
  { value: "date", label: "日付" },
  { value: "bool", label: "真偽値" },
  { value: "list", label: "リスト" },
  { value: "link", label: "リンク" },
] as const;

const CUSTOMIZED_TYPE_OPTIONS: { value: CustomizedType; label: string }[] = [
  { value: "Issue", label: "チケット" },
  { value: "Project", label: "プロジェクト" },
  { value: "TimeEntry", label: "作業時間" },
];

/**
 * Doubles as the create and the edit form. On edit the 対象 and 形式 selects are rendered
 * read-only: Redmine disables the format select for a persisted record and CustomField's STI
 * type never changes, so neither is submitted.
 */
export function CustomFieldForm({ trackers, field }: { trackers: Tracker[]; field?: CustomField }) {
  const [state, formAction, pending] = useActionState(
    field ? updateCustomFieldAction : createCustomFieldAction,
    initialState,
  );
  const [customizedType, setCustomizedType] = useState<CustomizedType>(field?.customizedType ?? "Issue");

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-md border-t pt-4">
      {field ? <input type="hidden" name="customFieldId" value={field.id} /> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          名称
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={30}
          defaultValue={field?.name}
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="customizedType" className="text-sm font-medium">
          対象
        </label>
        <select
          id="customizedType"
          name={field ? undefined : "customizedType"}
          required
          disabled={Boolean(field)}
          className="border rounded px-3 py-2 disabled:bg-gray-100"
          value={customizedType}
          onChange={(event) => setCustomizedType(event.target.value as CustomizedType)}
        >
          {CUSTOMIZED_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="fieldFormat" className="text-sm font-medium">
          形式
        </label>
        <select
          id="fieldFormat"
          name={field ? undefined : "fieldFormat"}
          required
          disabled={Boolean(field)}
          defaultValue={field?.fieldFormat}
          className="border rounded px-3 py-2 disabled:bg-gray-100"
        >
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
        <input
          id="possibleValues"
          name="possibleValues"
          defaultValue={field?.possibleValues.join(", ")}
          className="border rounded px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="defaultValue" className="text-sm font-medium">
          既定値
        </label>
        <input
          id="defaultValue"
          name="defaultValue"
          defaultValue={field?.defaultValue ?? ""}
          className="border rounded px-3 py-2"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isRequired" defaultChecked={field?.isRequired} />
        必須項目
      </label>

      <fieldset className="flex flex-col gap-1" hidden={customizedType !== "Issue"}>
        <legend className="text-sm font-medium">対象トラッカー</legend>
        {trackers.map((tracker) => (
          <label key={tracker.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="trackerIds"
              value={tracker.id}
              defaultChecked={field?.trackerIds.includes(tracker.id)}
            />
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
        {pending ? "保存中…" : field ? "変更を保存" : "カスタムフィールドを追加"}
      </button>
    </form>
  );
}
