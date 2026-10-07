"use client";

import { useActionState } from "react";
import { deleteWebhookAction, type WebhookActionState } from "@/interface/actions/webhook-actions";

const initialState: WebhookActionState = { error: null };

export function DeleteWebhookForm({ webhookId }: { webhookId: string }) {
  const [state, formAction, pending] = useActionState(deleteWebhookAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={webhookId} />
      <button type="submit" disabled={pending} className="text-sm text-red-600 underline disabled:opacity-50">
        {pending ? "削除中…" : "削除"}
      </button>
      {state.error ? (
        <span role="alert" className="text-sm text-red-600">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
