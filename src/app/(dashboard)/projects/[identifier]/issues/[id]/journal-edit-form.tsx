"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateJournalAction } from "@/interface/actions/journal-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

/**
 * Inline note editor, Redmine's journals#edit. Clearing the note of an entry that records
 * no attribute changes removes it — Redmine leaves an empty row its views skip, which looks
 * the same to a reader.
 */
export function JournalEditForm({
  journalId,
  notes,
  privateNotes,
  hasDetails,
  canSetNotesPrivate,
  locale,
}: {
  journalId: string;
  notes: string;
  privateNotes: boolean;
  hasDetails: boolean;
  canSetNotesPrivate: boolean;
  locale: Locale;
}) {
  const router = useRouter();
  const t = (key: MessageKey) => translate(locale, key);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes);
  const [draftPrivate, setDraftPrivate] = useState(privateNotes);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-xs underline self-start">
        {t("issue.edit")}
      </button>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await updateJournalAction({ journalId, notes: draft, privateNotes: draftPrivate });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} className="border rounded px-3 py-2" />
      {canSetNotesPrivate ? (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={draftPrivate} onChange={(event) => setDraftPrivate(event.target.checked)} />
          {t("issue.privateNotesCheck")}
        </label>
      ) : null}
      {draft.trim().length === 0 && !hasDetails ? (
        <p className="text-xs text-amber-700">{t("issue.emptyNoteWarning")}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="border rounded px-2 py-1 text-xs disabled:opacity-50">
          {pending ? t("issue.saving") : t("issue.save")}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(notes);
            setDraftPrivate(privateNotes);
            setEditing(false);
          }}
          className="text-xs underline"
        >
          {t("issue.cancel")}
        </button>
      </div>
    </form>
  );
}
