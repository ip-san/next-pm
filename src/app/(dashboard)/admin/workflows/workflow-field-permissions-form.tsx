"use client";

import { useActionState } from "react";
import { updateFieldPermissionsAction, type AdminActionState } from "@/interface/actions/admin-actions";
import { WORKFLOW_ELIGIBLE_FIELDS, type FieldPermissionRule, type WorkflowEligibleField } from "@/domain/workflow/entity";
import type { IssueStatus } from "@/domain/issue-status/entity";

const initialState: AdminActionState = { error: null };

const FIELD_LABELS: Record<WorkflowEligibleField, string> = {
  subject: "件名",
  description: "説明",
  assignedToId: "担当者",
  priorityId: "優先度",
  categoryId: "カテゴリ",
  fixedVersionId: "対象バージョン",
  startDate: "開始日",
  dueDate: "期日",
  doneRatio: "進捗率",
  estimatedHours: "予定工数",
  isPrivate: "プライベート",
};

/**
 * Fields (rows) × statuses (columns) grid — mirrors Redmine's workflows/permissions tab, but
 * scoped to a single tracker+role at a time (this page's existing selection model), so there's
 * no need for Redmine's multi-select bulk-edit "no_change" tri-state: every cell has one
 * definite value given the fixed scope.
 */
export function WorkflowFieldPermissionsForm({
  trackerId,
  roleId,
  statuses,
  ruleByCell,
}: {
  trackerId: string;
  roleId: string;
  statuses: IssueStatus[];
  ruleByCell: Array<[string, FieldPermissionRule]>;
}) {
  const [state, formAction, pending] = useActionState(updateFieldPermissionsAction, initialState);
  const rules = new Map(ruleByCell);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="trackerId" value={trackerId} />
      <input type="hidden" name="roleId" value={roleId} />

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse">
          <thead>
            <tr>
              <th className="border px-2 py-1 bg-gray-50 text-left">フィールド \ ステータス</th>
              {statuses.map((status) => (
                <th key={status.id} className="border px-2 py-1 bg-gray-50 whitespace-nowrap">
                  {status.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WORKFLOW_ELIGIBLE_FIELDS.map((field) => (
              <tr key={field}>
                <th className="border px-2 py-1 bg-gray-50 text-left whitespace-nowrap">{FIELD_LABELS[field]}</th>
                {statuses.map((status) => {
                  const cellKey = `${status.id}:${field}`;
                  return (
                    <td key={status.id} className="border px-2 py-1 text-center">
                      <select
                        name={`perm:${cellKey}`}
                        defaultValue={rules.get(cellKey) ?? ""}
                        className="border rounded px-1 py-0.5 text-xs"
                      >
                        <option value="">編集可</option>
                        <option value="readonly">読み取り専用</option>
                        <option value="required">必須</option>
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start"
      >
        {pending ? "保存中…" : "保存"}
      </button>
    </form>
  );
}
