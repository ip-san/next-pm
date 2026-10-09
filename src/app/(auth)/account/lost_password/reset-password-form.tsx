"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction, type ResetPasswordActionState } from "@/interface/actions/auth-actions";

const initialState: ResetPasswordActionState = { error: null, success: false };

export function ResetPasswordForm({ locale = "ja", token }: { token: string; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);

  if (state.success) {
    return (
      <p className="text-sm w-full max-w-sm">
        {t("auth.resetDone")}
        <Link href="/login" className="underline ml-1">
          {t("auth.toLogin")}
        </Link>
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 w-full max-w-sm">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1">
        <label htmlFor="newPassword" className="text-sm font-medium">
          {t("account.newPassword")}
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="border rounded px-3 py-2"
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {pending ? t("auth.resetting") : t("auth.resetSubmit")}
      </button>
    </form>
  );
}
