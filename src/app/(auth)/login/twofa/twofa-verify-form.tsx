"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { verifyTwofaAction, type VerifyTwofaActionState } from "@/interface/actions/auth-actions";

const initialState: VerifyTwofaActionState = { error: null };

export function TwofaVerifyForm({ locale = "ja" }: { locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(verifyTwofaAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 w-full max-w-sm">
      <div className="flex flex-col gap-1">
        <label htmlFor="code" className="text-sm font-medium">
          {t("account.confirmCode")}
        </label>
        <input
          id="code"
          name="code"
          autoComplete="one-time-code"
          autoFocus
          required
          className="border rounded px-3 py-2"
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-black text-white rounded px-3 py-2 disabled:opacity-50"
      >
        {pending ? t("account.confirming") : t("auth.verify")}
      </button>
    </form>
  );
}
