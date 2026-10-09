"use client";

import { useActionState } from "react";
import { uploadWikiAttachmentAction, type UploadWikiAttachmentActionState } from "@/interface/actions/wiki-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: UploadWikiAttachmentActionState = { error: null };

export function WikiAttachmentUploadForm({
  pageId,
  projectIdentifier,
  title,
  locale = "ja",
}: {
  pageId: string;
  projectIdentifier: string;
  title: string;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(uploadWikiAttachmentAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="title" value={title} />
      <input name="description" placeholder={t("news.descriptionField")} maxLength={255} className="border rounded px-2 py-1 text-sm" />
      <input type="file" name="file" required className="text-sm" />
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-1 text-sm disabled:opacity-50">
        {pending ? t("issue.uploading") : t("issue.attach")}
      </button>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
