"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteIssueAction } from "@/interface/actions/issue-actions";

/**
 * Redmine's destroy confirmation (`issues/destroy.html.erb`): when the issues about to be
 * deleted carry logged time, the user has to say what becomes of it before the delete runs.
 * A full page rather than a `window.confirm`, both because the choice needs three options
 * and because a native dialog blocks everything else on the page.
 */
export function DeleteIssueForm({
  issueId,
  projectIdentifier,
  subject,
  descendantCount,
  totalHours,
  reassignCandidates,
}: {
  issueId: string;
  projectIdentifier: string;
  subject: string;
  descendantCount: number;
  totalHours: number;
  /** Other issues in the same project that logged time can be moved onto. */
  reassignCandidates: { id: string; subject: string }[];
}) {
  const router = useRouter();
  const [timeEntryMode, setTimeEntryMode] = useState<"destroy" | "nullify" | "reassign">("destroy");
  const [reassignToIssueId, setReassignToIssueId] = useState(reassignCandidates[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await deleteIssueAction({ issueId, timeEntryMode, reassignToIssueId });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/projects/${result.projectIdentifier}/issues`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-xl">
      <p className="text-sm">
        「{subject}」を削除します。この操作は取り消せません。
        {descendantCount > 0 ? `子チケット ${descendantCount} 件も一緒に削除されます。` : null}
      </p>

      {totalHours > 0 ? (
        <fieldset className="flex flex-col gap-2 border rounded p-3">
          <legend className="text-sm font-medium px-1">記録済みの工数（合計 {totalHours}h）の扱い</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="timeEntryMode" checked={timeEntryMode === "destroy"} onChange={() => setTimeEntryMode("destroy")} />
            工数も削除する
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="timeEntryMode" checked={timeEntryMode === "nullify"} onChange={() => setTimeEntryMode("nullify")} />
            工数はプロジェクトに残す（チケットとの紐付けを外す）
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="timeEntryMode"
              checked={timeEntryMode === "reassign"}
              onChange={() => setTimeEntryMode("reassign")}
              disabled={reassignCandidates.length === 0}
            />
            別のチケットに付け替える
          </label>
          {timeEntryMode === "reassign" ? (
            <select
              aria-label="付け替え先チケット"
              value={reassignToIssueId}
              onChange={(event) => setReassignToIssueId(event.target.value)}
              className="border rounded px-3 py-2 ml-6"
            >
              {reassignCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  #{candidate.id.slice(0, 8)} {candidate.subject}
                </option>
              ))}
            </select>
          ) : null}
        </fieldset>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="bg-red-700 text-white rounded px-3 py-2 disabled:opacity-50">
          {pending ? "削除中…" : "削除する"}
        </button>
        <Link href={`/projects/${projectIdentifier}/issues/${issueId}`} className="text-sm underline">
          キャンセル
        </Link>
      </div>
    </form>
  );
}
