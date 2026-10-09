"use client";

import { useActionState } from "react";
import { uploadIssueAttachmentAction, type UploadAttachmentActionState } from "@/interface/actions/attachment-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: UploadAttachmentActionState = { error: null };

export function AttachmentUploadForm({ issueId, projectIdentifier, locale }: { issueId: string; projectIdentifier: string; locale: Locale }) {
  const [state, formAction, pending] = useActionState(uploadIssueAttachmentAction, initialState);
  const t = (key: MessageKey) => translate(locale, key);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="issueId" value={issueId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input name="description" placeholder={t("issue.attr.description")} maxLength={255} className="border rounded px-2 py-1 text-sm" />
      <input type="file" name="file" required className="text-sm" />
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-1 text-sm disabled:opacity-50">
        {pending ? t("issue.uploading") : t("issue.attach")}
      </button>
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
