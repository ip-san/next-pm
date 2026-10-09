"use client";

import { useActionState } from "react";
import { createNewsAction, type CreateNewsActionState } from "@/interface/actions/news-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: CreateNewsActionState = { error: null };

export function NewsCreateForm({ projectIdentifier, locale = "ja" }: { projectIdentifier: string; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(createNewsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-md border-t pt-4">
      <h2 className="font-medium text-sm">{t("news.create")}</h2>
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input name="title" placeholder={t("news.titlePlaceholder")} maxLength={60} required className="border rounded px-3 py-2 text-sm" />
      <input name="summary" placeholder={t("news.summaryPlaceholder")} maxLength={255} className="border rounded px-3 py-2 text-sm" />
      <textarea name="description" placeholder={t("news.descriptionPlaceholder")} required rows={6} className="border rounded px-3 py-2 text-sm" />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 text-sm self-start disabled:opacity-50">
        {t("news.submitCreate")}
      </button>
    </form>
  );
}
