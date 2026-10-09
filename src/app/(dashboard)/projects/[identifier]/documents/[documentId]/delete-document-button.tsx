"use client";

import { useActionState } from "react";
import { deleteDocumentAction, type DeleteDocumentActionState } from "@/interface/actions/document-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: DeleteDocumentActionState = { error: null };

export function DeleteDocumentButton({
  projectIdentifier,
  documentId,
  locale = "ja",
}: {
  projectIdentifier: string;
  documentId: string;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(deleteDocumentAction, initialState);

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="documentId" value={documentId} />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="text-xs underline text-red-600">
        {t("documents.delete")}
      </button>
    </form>
  );
}
