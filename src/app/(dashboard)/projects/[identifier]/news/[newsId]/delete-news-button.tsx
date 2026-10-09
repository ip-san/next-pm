"use client";

import { useActionState } from "react";
import { deleteNewsAction, type DeleteNewsActionState } from "@/interface/actions/news-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: DeleteNewsActionState = { error: null };

export function DeleteNewsButton({ projectIdentifier, newsId, locale = "ja" }: { projectIdentifier: string; newsId: string; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(deleteNewsAction, initialState);

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="newsId" value={newsId} />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="text-xs underline text-red-600">
        {t("issue.delete")}
      </button>
    </form>
  );
}
