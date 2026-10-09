"use client";

import { useActionState } from "react";
import {
  deleteMessageAttachmentAction,
  uploadMessageAttachmentAction,
  type MessageAttachmentActionState,
} from "@/interface/actions/message-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: MessageAttachmentActionState = { error: null };

export function MessageAttachmentUploadForm({
  projectIdentifier,
  boardId,
  messageId,
  locale = "ja",
}: {
  projectIdentifier: string;
  boardId: string;
  messageId: string;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);

  const [state, formAction, pending] = useActionState(uploadMessageAttachmentAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="messageId" value={messageId} />
      <input name="description" placeholder={t("news.descriptionField")} maxLength={255} className="border rounded px-2 py-1 text-sm" />
      <input type="file" name="file" required className="text-sm" />
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-1 text-sm disabled:opacity-50">
        {pending ? t("issue.uploading") : t("issue.attach")}
      </button>
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}

export function DeleteMessageAttachmentButton({
  projectIdentifier,
  boardId,
  attachmentId,
  locale = "ja",
}: {
  projectIdentifier: string;
  boardId: string;
  attachmentId: string;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);

  const [state, formAction, pending] = useActionState(deleteMessageAttachmentAction, initialState);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="attachmentId" value={attachmentId} />
      <button type="submit" disabled={pending} className="text-xs underline text-red-600 disabled:opacity-50">
        {t("issue.delete")}
      </button>
      {state.error ? <span className="text-xs text-red-600 ml-1">{state.error}</span> : null}
    </form>
  );
}
