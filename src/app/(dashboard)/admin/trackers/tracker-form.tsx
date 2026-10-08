"use client";

import { useActionState } from "react";
import { createTrackerAction, updateTrackerAction } from "@/interface/actions/admin-tracker-actions";
import type { AdminActionState } from "@/interface/actions/admin-action-state";
import { TRACKER_CORE_FIELDS, type TrackerCoreField } from "@/domain/tracker/core-fields";
import type { IssueStatus } from "@/domain/issue-status/entity";
import type { Tracker } from "@/domain/tracker/entity";

const initialState: AdminActionState = { error: null };

const CORE_FIELD_LABEL: Record<TrackerCoreField, string> = {
  assignedToId: "担当者",
  categoryId: "カテゴリ",
  fixedVersionId: "対象バージョン",
  parentId: "親チケット",
  startDate: "開始日",
  dueDate: "期日",
  estimatedHours: "予定工数",
  doneRatio: "進捗率",
  description: "説明",
  priorityId: "優先度",
};

/**
 * Doubles as the create and the edit form. On create it also offers Redmine's
 * `copy_workflow_from` select, which seeds the new tracker's workflow from an existing one.
 */
export function TrackerForm({
  statuses,
  trackers,
  tracker,
}: {
  statuses: IssueStatus[];
  trackers: Tracker[];
  tracker?: Tracker;
}) {
  const [state, formAction, pending] = useActionState(
    tracker ? updateTrackerAction : createTrackerAction,
    initialState,
  );
  const disabled = new Set(tracker?.disabledCoreFields ?? []);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-sm">
      {tracker ? <input type="hidden" name="trackerId" value={tracker.id} /> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          名称
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={30}
          defaultValue={tracker?.name}
          className="border rounded px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="defaultStatusId" className="text-sm font-medium">
          既定のステータス
        </label>
        <select
          id="defaultStatusId"
          name="defaultStatusId"
          required
          defaultValue={tracker?.defaultStatusId ?? ""}
          className="border rounded px-3 py-2"
        >
          <option value="">選択してください</option>
          {statuses.map((status) => (
            <option key={status.id} value={status.id}>
              {status.name}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isInRoadmap" defaultChecked={tracker?.isInRoadmap ?? true} />
        ロードマップに表示する
      </label>

      {/* Redmine's tracker[core_fields][]: a checked box means the field stays enabled. */}
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">標準フィールド</legend>
        {TRACKER_CORE_FIELDS.map((field) => (
          <label key={field} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="coreFields" value={field} defaultChecked={!disabled.has(field)} />
            {CORE_FIELD_LABEL[field]}
          </label>
        ))}
      </fieldset>
      {tracker ? null : (
        <div className="flex flex-col gap-1">
          <label htmlFor="copyWorkflowFrom" className="text-sm font-medium">
            ワークフローのコピー元
          </label>
          <select id="copyWorkflowFrom" name="copyWorkflowFrom" defaultValue="" className="border rounded px-3 py-2">
            <option value="">コピーしない</option>
            {trackers.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {pending ? "保存中…" : tracker ? "変更を保存" : "トラッカーを追加"}
      </button>
    </form>
  );
}
