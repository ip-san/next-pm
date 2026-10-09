"use client";

import { useActionState } from "react";
import { createBoardAction, type CreateBoardActionState } from "@/interface/actions/board-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: CreateBoardActionState = { error: null };

export interface BoardOption {
  id: string;
  label: string;
}

export function BoardCreateForm({
  projectIdentifier,
  parentOptions,
  locale = "ja",
}: {
  projectIdentifier: string;
  parentOptions: BoardOption[];
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(createBoardAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-md border-t pt-4">
      <h2 className="font-medium text-sm">{t("boards.create")}</h2>
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input name="name" placeholder={t("boards.namePlaceholder")} maxLength={30} required className="border rounded px-3 py-2 text-sm" />
      <textarea name="description" placeholder={t("news.descriptionField")} maxLength={255} required className="border rounded px-3 py-2 text-sm" />
      {parentOptions.length > 0 ? (
        <select name="parentId" defaultValue="" className="border rounded px-3 py-2 text-sm">
          <option value="">{t("boards.noParent")}</option>
          {parentOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 text-sm self-start disabled:opacity-50">
        {t("news.submitCreate")}
      </button>
    </form>
  );
}
