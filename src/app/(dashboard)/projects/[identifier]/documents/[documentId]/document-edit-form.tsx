"use client";

import { useActionState, useState } from "react";
import { updateDocumentAction, type UpdateDocumentActionState } from "@/interface/actions/document-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: UpdateDocumentActionState = { error: null };

export function DocumentEditForm({
  projectIdentifier,
  documentId,
  categoryId,
  title,
  description,
  categories,
  locale = "ja",
}: {
  projectIdentifier: string;
  documentId: string;
  categoryId: string;
  title: string;
  description: string;
  categories: { id: string; name: string }[];
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);

  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateDocumentAction, initialState);

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
      <input type="hidden" name="documentId" value={documentId} />
      <select name="categoryId" defaultValue={categoryId} required className="border rounded px-3 py-2 text-sm">
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <input name="title" defaultValue={title} maxLength={255} required className="border rounded px-3 py-2 text-sm" />
      <textarea name="description" defaultValue={description} rows={5} className="border rounded px-3 py-2 text-sm" />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-1 text-sm self-start disabled:opacity-50">
        {t("issue.save")}
      </button>
    </form>
  );
}
