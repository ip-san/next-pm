"use client";

import { useActionState } from "react";
import { updateIssueStatusAction, type UpdateIssueStatusActionState } from "@/interface/actions/issue-actions";
import type { IssueStatus } from "@/domain/issue-status/entity";
import type { Version } from "@/domain/version/entity";

const initialState: UpdateIssueStatusActionState = { error: null };

export function StatusUpdateForm({
  issueId,
  lockVersion,
  currentStatusId,
  currentFixedVersionId,
  allowedStatuses,
  versions,
}: {
  issueId: string;
  lockVersion: number;
  currentStatusId: string;
  currentFixedVersionId: string | null;
  allowedStatuses: IssueStatus[];
  versions: Version[];
}) {
  const [state, formAction, pending] = useActionState(updateIssueStatusAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-sm">
      <input type="hidden" name="issueId" value={issueId} />
      <input type="hidden" name="lockVersion" value={lockVersion} />
      <div className="flex flex-col gap-1">
        <label htmlFor="statusId" className="text-sm font-medium">
          ステータス
        </label>
        <select id="statusId" name="statusId" defaultValue={currentStatusId} className="border rounded px-3 py-2">
          {allowedStatuses.map((status) => (
            <option key={status.id} value={status.id}>
              {status.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="fixedVersionId" className="text-sm font-medium">
          対象バージョン
        </label>
        <select id="fixedVersionId" name="fixedVersionId" defaultValue={currentFixedVersionId ?? ""} className="border rounded px-3 py-2">
          <option value="">(なし)</option>
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="notes" className="text-sm font-medium">
          コメント
        </label>
        <textarea id="notes" name="notes" className="border rounded px-3 py-2" rows={3} />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {pending ? "更新中…" : "更新"}
      </button>
    </form>
  );
}
