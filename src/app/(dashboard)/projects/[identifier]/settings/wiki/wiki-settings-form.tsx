"use client";

import type { Locale } from "@/domain/i18n/locales";
import { interpolate, translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import {
  deleteProjectWikiAction,
  updateWikiStartPageAction,
  type WikiPageActionState,
} from "@/interface/actions/wiki-page-actions";

const initialState: WikiPageActionState = { error: null };

export function WikiStartPageForm({
  projectId,
  projectIdentifier,
  startPage,
  locale = "ja",
}: {
  projectId: string;
  projectIdentifier: string;
  startPage: string;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(updateWikiStartPageAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-md">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <div className="flex flex-col gap-1">
        <label htmlFor="startPage" className="text-sm font-medium">
          {t("projectSettings.wikiStartPage")}
        </label>
        <input id="startPage" name="startPage" defaultValue={startPage} className="border rounded px-3 py-2" />
        <p className="text-xs text-gray-500">{t("projectSettings.wikiStartPageHelp")}</p>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? t("issue.saving") : t("issue.save")}
      </button>
    </form>
  );
}

export function DeleteProjectWikiForm({
  projectId,
  projectIdentifier,
  pageCount,
  locale = "ja",
}: {
  projectId: string;
  projectIdentifier: string;
  pageCount: number;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(deleteProjectWikiAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-md">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <p className="text-sm">
        {interpolate(t("projectSettings.wikiDeleteWarning"), { count: pageCount })}
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirm" />
        {t("projectSettings.wikiDeleteConfirm")}
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-red-600 text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? t("issueDelete.deleting") : t("projectSettings.wikiDeleteSubmit")}
      </button>
    </form>
  );
}
