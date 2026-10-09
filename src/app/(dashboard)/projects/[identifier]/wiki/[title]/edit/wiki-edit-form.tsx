"use client";

import { useActionState } from "react";
import { saveWikiPageAction, type SaveWikiPageActionState } from "@/interface/actions/wiki-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: SaveWikiPageActionState = { error: null };

export interface ParentCandidate {
  id: string;
  title: string;
}

export function WikiEditForm({
  projectId,
  projectIdentifier,
  title,
  initialText,
  parentId,
  parentCandidates,
  canSetParent,
  locale = "ja",
}: {
  projectId: string;
  projectIdentifier: string;
  title: string;
  initialText: string;
  parentId: string | null;
  parentCandidates: ParentCandidate[];
  /**
   * Redmine shows the parent select when parent_id is a safe attribute: always while the
   * page is new, and afterwards only with rename_wiki_pages.
   */
  canSetParent: boolean;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(saveWikiPageAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-2xl">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="title" value={title} />
      <div className="flex flex-col gap-1">
        <label htmlFor="text" className="text-sm font-medium">
          {t("wiki.content")}
        </label>
        <textarea id="text" name="text" rows={16} defaultValue={initialText} className="border rounded px-3 py-2 font-mono text-sm" />
      </div>
      {canSetParent ? (
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
      <div className="flex flex-col gap-1">
        <label htmlFor="comments" className="text-sm font-medium">
          {t("issue.comment")}
        </label>
        <input id="comments" name="comments" className="border rounded px-3 py-2" />
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
