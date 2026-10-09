"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { updateAttachmentDescriptionAction, type FileActionState } from "@/interface/actions/file-actions";

const initialState: FileActionState = { error: null };

export function FileDescriptionForm({
  projectIdentifier,
  attachmentId,
  description,
  locale = "ja",
}: {
  projectIdentifier: string;
  attachmentId: string;
  description: string;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(updateAttachmentDescriptionAction, initialState);
  const inputId = `attachment-description-${attachmentId}`;

  return (
    <form action={formAction} className="flex items-center gap-1 mt-1">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="attachmentId" value={attachmentId} />
      <label htmlFor={inputId} className="sr-only">
        {translate(locale, "news.descriptionField")}
      </label>
      <input
        id={inputId}
        name="description"
        defaultValue={description}
        placeholder={t("news.descriptionField")}
        maxLength={255}
        className="border rounded px-2 py-0.5 text-xs"
      />
      <button type="submit" disabled={pending} className="text-xs underline">
        {translate(locale, "issue.save")}
      </button>
      {state.error ? <span role="alert" className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
