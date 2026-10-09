"use client";

import { useActionState } from "react";
import { postMessageAction, type PostMessageActionState } from "@/interface/actions/message-actions";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";

const initialState: PostMessageActionState = { error: null };

export function MessageForm({
  projectIdentifier,
  boardId,
  parentId,
  replySubject,
  defaultContent,
  locale = "ja",
}: {
  projectIdentifier: string;
  boardId: string;
  parentId: string | null;
  /** Prefilled subject for a reply — "RE: <topic>", or the quoted variant (MessagesController#quote). */
  replySubject?: string;
  /** Prefilled body when replying via 引用 (quote). */
  defaultContent?: string;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);

  const [state, formAction, pending] = useActionState(postMessageAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 max-w-2xl">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="boardId" value={boardId} />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      {parentId ? (
        <input type="hidden" name="subject" value={replySubject ?? ""} />
      ) : (
        <input name="subject" placeholder={t("boards.subject")} maxLength={255} required className="border rounded px-3 py-2 text-sm" />
      )}
      <textarea
        name="content"
        // `key` forces React to re-seed the textarea when the quoted body changes: the reply
        // form stays mounted while the ?quote= search param navigates.
        key={defaultContent ?? ""}
        defaultValue={defaultContent ?? ""}
        placeholder={parentId ? t("boards.replyPlaceholder") : t("boards.content")}
        required
        rows={5}
        className="border rounded px-3 py-2 text-sm"
      />
      {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 text-sm self-start disabled:opacity-50">
        {pending ? t("boards.sending") : parentId ? t("boards.replySubmit") : t("boards.postSubmit")}
      </button>
    </form>
  );
}
