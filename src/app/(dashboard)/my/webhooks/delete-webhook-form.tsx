"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { deleteWebhookAction, type WebhookActionState } from "@/interface/actions/webhook-actions";

const initialState: WebhookActionState = { error: null };

export function DeleteWebhookForm({ locale = "ja", webhookId }: { webhookId: string; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(deleteWebhookAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={webhookId} />
      <button type="submit" disabled={pending} className="text-sm text-red-600 underline disabled:opacity-50">
        {pending ? t("issueDelete.deleting") : t("issue.delete")}
      </button>
      {state.error ? (
        <span role="alert" className="text-sm text-red-600">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
