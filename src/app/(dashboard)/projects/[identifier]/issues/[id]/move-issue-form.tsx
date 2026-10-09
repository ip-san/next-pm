"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { moveIssueAction } from "@/interface/actions/issue-actions";
import type { Project } from "@/domain/project/entity";
import type { Tracker } from "@/domain/tracker/entity";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

/**
 * Redmine's "move to another project" control, kept separate from the edit form on purpose:
 * everything the edit form offers (trackers, members, categories, versions, custom fields)
 * is scoped to the current project, so a project select inside it would be stale the moment
 * it changed. `targets` only ever lists projects the viewer can add issues to.
 */
export function MoveIssueForm({
  issueId,
  currentProjectId,
  targets,
  trackersByProjectId,
  locale,
}: {
  issueId: string;
  currentProjectId: string;
  targets: Project[];
  /** Trackers enabled per candidate project, so the tracker select follows the chosen target. */
  trackersByProjectId: Record<string, Tracker[]>;
  locale: Locale;
}) {
  const router = useRouter();
  const t = (key: MessageKey) => translate(locale, key);
  const otherProjects = targets.filter((project) => project.id !== currentProjectId);
  const [targetProjectId, setTargetProjectId] = useState(otherProjects[0]?.id ?? "");
  const [targetTrackerId, setTargetTrackerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (otherProjects.length === 0) return null;

  const trackers = trackersByProjectId[targetProjectId] ?? [];

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await moveIssueAction({ issueId, targetProjectId, targetTrackerId });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/projects/${result.projectIdentifier}/issues/${issueId}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="targetProjectId" className="text-sm font-medium">
          {t("issue.moveTarget")}
        </label>
        <select
          id="targetProjectId"
          value={targetProjectId}
          onChange={(event) => {
            setTargetProjectId(event.target.value);
            setTargetTrackerId("");
          }}
          className="border rounded px-3 py-2"
        >
          {otherProjects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="targetTrackerId" className="text-sm font-medium">
          {t("issue.attr.trackerId")}
        </label>
        <select
          id="targetTrackerId"
          value={targetTrackerId}
          onChange={(event) => setTargetTrackerId(event.target.value)}
          className="border rounded px-3 py-2"
        >
          {/* Blank keeps Redmine's rule: the current tracker if the target enables it,
              otherwise that project's first one. */}
          <option value="">{t("issue.trackerAuto")}</option>
          {trackers.map((tracker) => (
            <option key={tracker.id} value={tracker.id}>
              {tracker.name}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending} className="border rounded px-3 py-2 disabled:opacity-50">
        {pending ? t("issue.moving") : t("issue.move")}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-600 w-full">
          {error}
        </p>
      ) : null}
    </form>
  );
}
