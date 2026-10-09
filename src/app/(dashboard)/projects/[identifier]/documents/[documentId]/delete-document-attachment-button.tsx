"use client";

import { useActionState } from "react";
import { deleteDocumentAttachmentAction, type DeleteDocumentAttachmentActionState } from "@/interface/actions/document-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: DeleteDocumentAttachmentActionState = { error: null };

export function DeleteDocumentAttachmentButton({
  projectIdentifier,
  attachmentId,
  locale = "ja",
}: {
  projectIdentifier: string;
  attachmentId: string;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(deleteDocumentAttachmentAction, initialState);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="attachmentId" value={attachmentId} />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="text-xs underline text-red-600">
        {t("issue.delete")}
      </button>
    </form>
  );
}
