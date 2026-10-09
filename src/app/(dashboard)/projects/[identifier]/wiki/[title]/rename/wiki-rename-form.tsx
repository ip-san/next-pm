"use client";

import { useActionState } from "react";
import { renameWikiPageAction, type RenameWikiPageActionState } from "@/interface/actions/wiki-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: RenameWikiPageActionState = { error: null };

export interface ParentCandidate {
  id: string;
  title: string;
}

export function WikiRenameForm({
  pageId,
  projectIdentifier,
  title,
  parentId,
  parentCandidates,
  canReparent,
  isStartPage,
  canSetStartPage,
  locale = "ja",
}: {
  pageId: string;
  projectIdentifier: string;
  title: string;
  parentId: string | null;
  parentCandidates: ParentCandidate[];
  /** rename_wiki_pages. Without it Redmine drops title and parent_id from the submitted attributes. */
  canReparent: boolean;
  isStartPage: boolean;
  /** manage_wiki — what makes Redmine's is_start_page a safe attribute. */
  canSetStartPage: boolean;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(renameWikiPageAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-md">
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <div className="flex flex-col gap-1">
        <label htmlFor="newTitle" className="text-sm font-medium">
          {t("wiki.newTitle")}
        </label>
        <input id="newTitle" name="newTitle" defaultValue={title} className="border rounded px-3 py-2" />
      </div>
      {canReparent ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="parentId" className="text-sm font-medium">
            {t("wiki.parent")}
          </label>
          <select id="parentId" name="parentId" defaultValue={parentId ?? ""} className="border rounded px-3 py-2">
            <option value="">{t("query.none")}</option>
            {parentCandidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {canSetStartPage ? (
        <label className="flex items-center gap-2 text-sm">
          {/* Already the start page: Redmine checks and disables the box, because the setting
              follows the rename either way. */}
          <input type="checkbox" name="isStartPage" defaultChecked={isStartPage} disabled={isStartPage} />
          {t("wiki.startPage")}
        </label>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="keepRedirect" defaultChecked />
        {t("wiki.redirectLinks")}
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? t("wiki.renaming") : t("wiki.rename")}
      </button>
    </form>
  );
}
