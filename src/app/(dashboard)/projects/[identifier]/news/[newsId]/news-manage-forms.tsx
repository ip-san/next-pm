"use client";

import { useActionState, useState } from "react";
import {
  deleteNewsAttachmentAction,
  deleteNewsCommentAction,
  updateNewsAction,
  uploadNewsAttachmentAction,
  type NewsMutationActionState,
} from "@/interface/actions/news-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: NewsMutationActionState = { error: null };

export function NewsEditForm({
  projectIdentifier,
  newsId,
  title,
  summary,
  description,
  locale = "ja",
}: {
  projectIdentifier: string;
  newsId: string;
  title: string;
  summary: string;
  description: string;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);

  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateNewsAction, initialState);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs underline">
        {t("issue.edit")}
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-2xl mt-2">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="newsId" value={newsId} />
      <input name="title" defaultValue={title} maxLength={60} required className="border rounded px-3 py-2 text-sm" />
      <input name="summary" defaultValue={summary} maxLength={255} placeholder={t("news.summaryPlaceholder")} className="border rounded px-3 py-2 text-sm" />
      <textarea name="description" defaultValue={description} required rows={5} className="border rounded px-3 py-2 text-sm" />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-1 text-sm self-start disabled:opacity-50">
        {t("issue.save")}
      </button>
    </form>
  );
}

export function DeleteNewsCommentButton({
  projectIdentifier,
  newsId,
  commentId,
  locale = "ja",
}: {
  projectIdentifier: string;
  newsId: string;
  commentId: string;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);

  const [state, formAction, pending] = useActionState(deleteNewsCommentAction, initialState);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="newsId" value={newsId} />
      <input type="hidden" name="commentId" value={commentId} />
      <button type="submit" disabled={pending} className="text-xs underline text-red-600 disabled:opacity-50">
        {t("issue.delete")}
      </button>
      {state.error ? <span className="text-xs text-red-600 ml-1">{state.error}</span> : null}
    </form>
  );
}

export function NewsAttachmentUploadForm({ projectIdentifier, newsId, locale = "ja" }: { projectIdentifier: string; newsId: string; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(uploadNewsAttachmentAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="newsId" value={newsId} />
      <input name="description" placeholder={t("news.descriptionField")} maxLength={255} className="border rounded px-2 py-1 text-sm" />
      <input type="file" name="file" required className="text-sm" />
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-1 text-sm disabled:opacity-50">
        {pending ? t("issue.uploading") : t("issue.attach")}
      </button>
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}

export function DeleteNewsAttachmentButton({
  projectIdentifier,
  newsId,
  attachmentId,
  locale = "ja",
}: {
  projectIdentifier: string;
  newsId: string;
  attachmentId: string;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);

  const [state, formAction, pending] = useActionState(deleteNewsAttachmentAction, initialState);

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="newsId" value={newsId} />
      <input type="hidden" name="attachmentId" value={attachmentId} />
      <button type="submit" disabled={pending} className="text-xs underline text-red-600 disabled:opacity-50">
        {t("issue.delete")}
      </button>
      {state.error ? <span className="text-xs text-red-600 ml-1">{state.error}</span> : null}
    </form>
  );
}
