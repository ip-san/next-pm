"use client";

import { useActionState } from "react";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import {
  archiveProjectAction,
  closeProjectAction,
  reopenProjectAction,
  unarchiveProjectAction,
  type ProjectStatusActionState,
} from "@/interface/actions/project-actions";

const initialState: ProjectStatusActionState = { error: null };

const TRANSITIONS = {
  archive: { action: archiveProjectAction, labelKey: "projectStatus.archive" },
  unarchive: { action: unarchiveProjectAction, labelKey: "projectStatus.unarchive" },
  close: { action: closeProjectAction, labelKey: "projectStatus.close" },
  reopen: { action: reopenProjectAction, labelKey: "projectStatus.reopen" },
} as const;

/** The archive and close transitions cascade to the whole subtree, so their confirmation says so. */
const CONFIRM_KEYS: Partial<Record<ProjectStatusTransition, MessageKey>> = {
  archive: "projectStatus.confirmArchive",
  close: "projectStatus.confirmClose",
};

export type ProjectStatusTransition = keyof typeof TRANSITIONS;

/**
 * One button per status transition (Redmine's project action menu). Archive and close both
 * cascade to the whole subtree, so the confirmation says so rather than naming one project.
 */
export function ProjectStatusButton({
  projectIdentifier,
  transition,
  locale = "ja",
}: {
  projectIdentifier: string;
  transition: ProjectStatusTransition;
  locale?: Locale;
}) {
  const { action, labelKey } = TRANSITIONS[transition];
  const [state, formAction, pending] = useActionState(action, initialState);
  const confirmKey = CONFIRM_KEYS[transition];

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <button
        type="submit"
        disabled={pending}
        className="text-sm underline disabled:opacity-50"
        onClick={(event) => {
          if (confirmKey && !window.confirm(translate(locale, confirmKey))) {
            event.preventDefault();
          }
        }}
      >
        {translate(locale, labelKey)}
      </button>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
