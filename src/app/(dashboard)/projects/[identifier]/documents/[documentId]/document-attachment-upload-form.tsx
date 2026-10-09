"use client";

import { useActionState } from "react";
import { uploadDocumentAttachmentAction, type UploadDocumentAttachmentActionState } from "@/interface/actions/document-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: UploadDocumentAttachmentActionState = { error: null };

export function DocumentAttachmentUploadForm({
  documentId,
  projectIdentifier,
  locale = "ja",
}: {
  documentId: string;
  projectIdentifier: string;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(uploadDocumentAttachmentAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input name="description" placeholder={t("news.descriptionField")} maxLength={255} className="border rounded px-2 py-1 text-sm" />
      <input type="file" name="file" required className="text-sm" />
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-1 text-sm disabled:opacity-50">
        {pending ? t("issue.uploading") : t("issue.attach")}
      </button>
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
