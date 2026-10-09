"use client";

import { useActionState } from "react";
import { deleteProjectAction, type DeleteProjectActionState } from "@/interface/actions/project-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: DeleteProjectActionState = { error: null };

/**
 * Redmine's projects/destroy confirmation: deletion is irreversible and takes every
 * subproject with it, so it is confirmed by typing the identifier rather than by an OK
 * button. The check is re-run server side — this form is only where the value is typed.
 */
export function DeleteProjectForm({ projectIdentifier, locale = "ja" }: { projectIdentifier: string; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(deleteProjectAction, initialState);

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-red-600">{t("projectDelete.summary")}</summary>
      <form action={formAction} className="flex flex-col gap-2 mt-2 max-w-md">
        <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
        <p className="text-xs text-gray-600">
          {t("projectDelete.warning")}
          <code className="font-mono">{projectIdentifier}</code>
          {t("projectDelete.warningEnd")}
        </p>
        <input
          name="confirmIdentifier"
          autoComplete="off"
          placeholder={projectIdentifier}
          aria-label={t("projectDelete.identifierAria")}
          className="border rounded px-2 py-1"
        />
        {state.error ? (
          <p role="alert" className="text-xs text-red-600">
            {state.error}
          </p>
        ) : null}
        <button type="submit" disabled={pending} className="bg-red-600 text-white rounded px-3 py-1 disabled:opacity-50 self-start">
          {pending ? t("projectDelete.deleting") : t("projectDelete.submit")}
        </button>
      </form>
    </details>
  );
}
