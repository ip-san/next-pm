"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteIssueAction } from "@/interface/actions/issue-actions";
import type { Locale } from "@/domain/i18n/locales";
import { interpolate, translate, type MessageKey } from "@/domain/i18n/messages";

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
  locale = "ja",
}: {
  issueId: string;
  projectIdentifier: string;
  subject: string;
  descendantCount: number;
  totalHours: number;
  /** Other issues in the same project that logged time can be moved onto. */
  reassignCandidates: { id: string; number: number; subject: string }[];
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
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
        {interpolate(t("issueDelete.confirm"), { subject })}
        {descendantCount > 0 ? interpolate(t("issueDelete.descendants"), { count: descendantCount }) : null}
      </p>

      {totalHours > 0 ? (
        <fieldset className="flex flex-col gap-2 border rounded p-3">
          <legend className="text-sm font-medium px-1">{interpolate(t("issueDelete.timeLegend"), { hours: totalHours })}</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="timeEntryMode" checked={timeEntryMode === "destroy"} onChange={() => setTimeEntryMode("destroy")} />
            {t("issueDelete.timeDestroy")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="timeEntryMode" checked={timeEntryMode === "nullify"} onChange={() => setTimeEntryMode("nullify")} />
            {t("issueDelete.timeNullify")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="timeEntryMode"
              checked={timeEntryMode === "reassign"}
              onChange={() => setTimeEntryMode("reassign")}
              disabled={reassignCandidates.length === 0}
            />
            {t("issueDelete.timeReassign")}
          </label>
          {timeEntryMode === "reassign" ? (
            <select
              aria-label={t("issueDelete.reassignTarget")}
              value={reassignToIssueId}
              onChange={(event) => setReassignToIssueId(event.target.value)}
              className="border rounded px-3 py-2 ml-6"
            >
              {reassignCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  #{candidate.number} {candidate.subject}
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
          {pending ? t("issueDelete.deleting") : t("issueDelete.submit")}
        </button>
        <Link href={`/projects/${projectIdentifier}/issues/${issueId}`} className="text-sm underline">
          {t("issue.cancel")}
        </Link>
      </div>
    </form>
  );
}
