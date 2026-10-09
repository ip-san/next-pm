"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { deleteIssueCategoryAction, type IssueCategoryActionState } from "@/interface/actions/issue-category-actions";

const initialState: IssueCategoryActionState = { error: null };

export function DeleteIssueCategoryButton({ locale = "ja", projectIdentifier, categoryId }: { projectIdentifier: string; categoryId: string; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(deleteIssueCategoryAction, initialState);

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="categoryId" value={categoryId} />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="text-xs underline text-red-600">
        {t("issue.delete")}
      </button>
    </form>
  );
}
