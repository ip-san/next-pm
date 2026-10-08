"use client";

import { useActionState, useState } from "react";
import { bulkUpdateIssuesAction, type BulkEditActionState } from "@/interface/actions/bulk-edit-actions";
import { CustomFieldInputs } from "../custom-field-inputs";
import type { IssueStatus } from "@/domain/issue-status/entity";
import type { Enumeration } from "@/domain/enumeration/entity";
import type { User } from "@/domain/user/entity";
import type { Group } from "@/domain/group/entity";
import type { Tracker } from "@/domain/tracker/entity";
import type { IssueCategory } from "@/domain/issue-category/entity";
import type { Version } from "@/domain/version/entity";
import type { CustomField } from "@/domain/custom-field/entity";

const initialState: BulkEditActionState = { error: null, message: null };

export function BulkEditForm({
  projectIdentifier,
  issueIds,
  trackers,
  statuses,
  priorities,
  members,
  groups,
  categories,
  versions,
  customFields,
  canSetNotesPrivate,
}: {
  projectIdentifier: string;
  issueIds: string[];
  trackers: Tracker[];
  statuses: IssueStatus[];
  priorities: Enumeration[];
  members: User[];
  groups: Group[];
  categories: IssueCategory[];
  versions: Version[];
  /** The fields every selected issue's tracker enables (Issue.available_custom_fields). */
  customFields: CustomField[];
  canSetNotesPrivate: boolean;
}) {
  const [state, formAction, pending] = useActionState(bulkUpdateIssuesAction, initialState);
  // Blank means "leave it alone", so an empty value is simply not submitted.
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-sm">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      {issueIds.map((id) => (
        <input key={id} type="hidden" name="issueIds" value={id} />
      ))}

      <div className="flex flex-col gap-1">
        <label htmlFor="trackerId" className="text-sm font-medium">
          トラッカー
        </label>
        <select id="trackerId" name="trackerId" defaultValue="" className="border rounded px-3 py-2">
          <option value="">(変更しない)</option>
          {trackers.map((tracker) => (
            <option key={tracker.id} value={tracker.id}>
              {tracker.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="statusId" className="text-sm font-medium">
          ステータス
        </label>
        <select id="statusId" name="statusId" defaultValue="" className="border rounded px-3 py-2">
          <option value="">(変更しない)</option>
          {statuses.map((status) => (
            <option key={status.id} value={status.id}>
              {status.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="priorityId" className="text-sm font-medium">
          優先度
        </label>
        <select id="priorityId" name="priorityId" defaultValue="" className="border rounded px-3 py-2">
          <option value="">(変更しない)</option>
          {priorities.map((priority) => (
            <option key={priority.id} value={priority.id}>
              {priority.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="categoryId" className="text-sm font-medium">
          カテゴリ
        </label>
        <select id="categoryId" name="categoryId" defaultValue="" className="border rounded px-3 py-2">
          <option value="">(変更しない)</option>
          <option value="__none__">(なし)</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="fixedVersionId" className="text-sm font-medium">
          対象バージョン
        </label>
        <select id="fixedVersionId" name="fixedVersionId" defaultValue="" className="border rounded px-3 py-2">
          <option value="">(変更しない)</option>
          <option value="__none__">(なし)</option>
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="assignedToId" className="text-sm font-medium">
          担当者
        </label>
        <select id="assignedToId" name="assignedToId" defaultValue="" className="border rounded px-3 py-2">
          <option value="">(変更しない)</option>
          <option value="__none__">(未割当にする)</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.lastname} {member.firstname}
            </option>
          ))}
          {groups.map((group) => (
            <option key={group.id} value={`group:${group.id}`}>
              {group.name}（グループ）
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="startDate" className="text-sm font-medium">
          開始日
        </label>
        <input id="startDate" name="startDate" type="date" className="border rounded px-3 py-2" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="dueDate" className="text-sm font-medium">
          期日
        </label>
        <input id="dueDate" name="dueDate" type="date" className="border rounded px-3 py-2" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="doneRatio" className="text-sm font-medium">
          進捗率（%）
        </label>
        <input id="doneRatio" name="doneRatio" type="number" min={0} max={100} step={10} className="border rounded px-3 py-2" />
      </div>

      <CustomFieldInputs
        fields={customFields}
        values={customFieldValues}
        onChange={(customFieldId, value) => setCustomFieldValues((current) => ({ ...current, [customFieldId]: value }))}
        idPrefix="bulk"
      />
      {customFields.map((field) =>
        customFieldValues[field.id] ? <input key={field.id} type="hidden" name={`cf_${field.id}`} value={customFieldValues[field.id]} /> : null,
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="notes" className="text-sm font-medium">
          コメント
        </label>
        <textarea id="notes" name="notes" rows={3} className="border rounded px-3 py-2" />
      </div>
      {canSetNotesPrivate ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="privateNotes" />
          コメントを非公開にする
        </label>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.message ? <p className="text-sm text-green-700">{state.message}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? "更新中…" : "更新"}
      </button>
    </form>
  );
}
