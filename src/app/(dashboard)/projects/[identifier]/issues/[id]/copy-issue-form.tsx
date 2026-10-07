"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { copyIssueAction } from "@/interface/actions/issue-actions";
import type { Project } from "@/domain/project/entity";
import type { Tracker } from "@/domain/tracker/entity";

/**
 * Redmine's copy form (`IssuesController#new` with `copy_from`), reduced to the choices that
 * actually differ from an ordinary create: where the copy lands, and which of the three
 * attached collections come with it. `targets` only lists projects the viewer can add
 * issues to, so the dropdown can't reveal a project they shouldn't know about.
 */
export function CopyIssueForm({
  issueId,
  currentProjectId,
  hasSubtasks,
  hasAttachments,
  canAddWatchers,
  targets,
  trackersByProjectId,
}: {
  issueId: string;
  currentProjectId: string;
  hasSubtasks: boolean;
  hasAttachments: boolean;
  canAddWatchers: boolean;
  targets: Project[];
  trackersByProjectId: Record<string, Tracker[]>;
}) {
  const router = useRouter();
  const [targetProjectId, setTargetProjectId] = useState(currentProjectId);
  const [targetTrackerId, setTargetTrackerId] = useState("");
  const [copyAttachments, setCopyAttachments] = useState(false);
  const [copySubtasks, setCopySubtasks] = useState(hasSubtasks);
  const [copyWatchers, setCopyWatchers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const trackers = trackersByProjectId[targetProjectId] ?? [];

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await copyIssueAction({
      sourceIssueId: issueId,
      targetProjectId,
      targetTrackerId,
      copyAttachments,
      copySubtasks,
      copyWatchers,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/projects/${result.projectIdentifier}/issues/${result.issueId}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="copyTargetProjectId" className="text-sm font-medium">
            コピー先プロジェクト
          </label>
          <select
            id="copyTargetProjectId"
            value={targetProjectId}
            onChange={(event) => {
              setTargetProjectId(event.target.value);
              setTargetTrackerId("");
            }}
            className="border rounded px-3 py-2"
          >
            {targets.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="copyTargetTrackerId" className="text-sm font-medium">
            トラッカー
          </label>
          <select
            id="copyTargetTrackerId"
            value={targetTrackerId}
            onChange={(event) => setTargetTrackerId(event.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="">(そのまま / 自動)</option>
            {trackers.map((tracker) => (
              <option key={tracker.id} value={tracker.id}>
                {tracker.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={pending} className="border rounded px-3 py-2 disabled:opacity-50">
          {pending ? "コピー中…" : "コピー"}
        </button>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        {hasAttachments ? (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={copyAttachments} onChange={(event) => setCopyAttachments(event.target.checked)} />
            添付ファイルもコピー
          </label>
        ) : null}
        {hasSubtasks ? (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={copySubtasks} onChange={(event) => setCopySubtasks(event.target.checked)} />
            子チケットもコピー
          </label>
        ) : null}
        {canAddWatchers ? (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={copyWatchers} onChange={(event) => setCopyWatchers(event.target.checked)} />
            ウォッチャーもコピー
          </label>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </form>
  );
}
