"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { lostPasswordAction, type LostPasswordActionState } from "@/interface/actions/auth-actions";

const initialState: LostPasswordActionState = { error: null, success: false };

export function LostPasswordRequestForm({ locale = "ja" }: { locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(lostPasswordAction, initialState);

  if (state.success) {
    return (
      <p className="text-sm w-full max-w-sm">
        {t("auth.requestSent")}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 w-full max-w-sm">
      <div className="flex flex-col gap-1">
        <label htmlFor="mail" className="text-sm font-medium">
          {t("account.mail")}
        </label>
        <input id="mail" name="mail" type="email" autoComplete="email" required className="border rounded px-3 py-2" />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {pending ? t("auth.sending") : t("auth.sendReset")}
      </button>
    </form>
  );
}
