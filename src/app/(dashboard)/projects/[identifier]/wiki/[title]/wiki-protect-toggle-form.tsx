"use client";

import { useActionState } from "react";
import { setWikiPageProtectionAction, type WikiPageActionState } from "@/interface/actions/wiki-page-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: WikiPageActionState = { error: null };

export function WikiProtectToggleForm({
  pageId,
  projectIdentifier,
  title,
  isProtected,
  locale = "ja",
}: {
  pageId: string;
  projectIdentifier: string;
  title: string;
  isProtected: boolean;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(setWikiPageProtectionAction, initialState);

  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="isProtected" value={isProtected ? "0" : "1"} />
      <button type="submit" disabled={pending} className="text-sm underline disabled:opacity-50">
        {isProtected ? t("wiki.unprotect") : t("wiki.protect")}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
