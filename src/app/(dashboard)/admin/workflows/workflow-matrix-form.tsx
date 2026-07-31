"use client";

import { useActionState } from "react";
import { updateWorkflowAction, type AdminActionState } from "@/interface/actions/admin-actions";
import type { IssueStatus } from "@/domain/issue-status/entity";

const initialState: AdminActionState = { error: null };

/**
 * Each cell is a single checkbox for a plain (unflagged) transition — Redmine additionally
 * offers per-cell "author"/"assignee" unlock flags, which this simplifies away for now
 * (same spirit as the other documented simplifications in this codebase).
 */
export function WorkflowMatrixForm({
  trackerId,
  roleId,
  statuses,
  allowedPairs,
}: {
  trackerId: string;
  roleId: string;
  statuses: IssueStatus[];
  allowedPairs: string[];
}) {
  const [state, formAction, pending] = useActionState(updateWorkflowAction, initialState);
  const allowed = new Set(allowedPairs);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="trackerId" value={trackerId} />
      <input type="hidden" name="roleId" value={roleId} />

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse">
          <thead>
            <tr>
              <th className="border px-2 py-1 bg-gray-50">現在 \ 遷移先</th>
              {statuses.map((newStatus) => (
                <th key={newStatus.id} className="border px-2 py-1 bg-gray-50 whitespace-nowrap">
                  {newStatus.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {statuses.map((oldStatus) => (
              <tr key={oldStatus.id}>
                <th className="border px-2 py-1 bg-gray-50 text-left whitespace-nowrap">{oldStatus.name}</th>
                {statuses.map((newStatus) => {
                  const pairKey = `${oldStatus.id}:${newStatus.id}`;
                  return (
                    <td key={newStatus.id} className="border px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        name="transitions"
                        value={pairKey}
                        defaultChecked={allowed.has(pairKey)}
                      />
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
