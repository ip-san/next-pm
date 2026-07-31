"use client";

import { useActionState } from "react";
import { bulkUpdateIssuesAction, type BulkEditActionState } from "@/interface/actions/bulk-edit-actions";
import type { IssueStatus } from "@/domain/issue-status/entity";
import type { Enumeration } from "@/domain/enumeration/entity";
import type { User } from "@/domain/user/entity";

const initialState: BulkEditActionState = { error: null, message: null };

export function BulkEditForm({
  projectIdentifier,
  issueIds,
  statuses,
  priorities,
  members,
}: {
  projectIdentifier: string;
  issueIds: string[];
  statuses: IssueStatus[];
  priorities: Enumeration[];
  members: User[];
}) {
  const [state, formAction, pending] = useActionState(bulkUpdateIssuesAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-sm">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      {issueIds.map((id) => (
        <input key={id} type="hidden" name="issueIds" value={id} />
      ))}

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
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="doneRatio" className="text-sm font-medium">
          進捗率（%）
        </label>
        <input id="doneRatio" name="doneRatio" type="number" min={0} max={100} step={10} className="border rounded px-3 py-2" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="notes" className="text-sm font-medium">
          コメント
        </label>
        <textarea id="notes" name="notes" rows={3} className="border rounded px-3 py-2" />
      </div>

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
