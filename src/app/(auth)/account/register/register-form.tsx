"use client";

import type { Locale } from "@/domain/i18n/locales";
import { interpolate, translate, type MessageKey } from "@/domain/i18n/messages";
import Link from "next/link";
import { useActionState } from "react";
import { registerAction, type RegisterActionState } from "@/interface/actions/account-actions";

const initialState: RegisterActionState = { error: null, outcome: null };

export function RegisterForm({ locale = "ja", passwordMinLength }: { passwordMinLength: number; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  if (state.outcome) {
    return (
      <div className="flex flex-col gap-4 w-full max-w-sm">
        <p className="text-sm">
          {state.outcome === "activation_email_sent"
            ? t("auth.registerSent")
            : t("auth.registerReceived")}
        </p>
        <Link href="/login" className="text-sm underline self-start">
          {t("auth.toLoginPage")}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 w-full max-w-sm">
      <div className="flex flex-col gap-1">
        <label htmlFor="login" className="text-sm font-medium">
          {t("login.loginId")}
        </label>
        <input id="login" name="login" autoComplete="username" required maxLength={30} className="border rounded px-3 py-2" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          {t("login.password")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className="border rounded px-3 py-2"
        />
        <span className="text-xs text-gray-500">{interpolate(translate(locale, "auth.minLength"), { count: passwordMinLength })}</span>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="lastname" className="text-sm font-medium">
          {t("account.lastname")}
        </label>
        <input id="lastname" name="lastname" autoComplete="family-name" required className="border rounded px-3 py-2" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="firstname" className="text-sm font-medium">
          {t("account.firstname")}
        </label>
        <input id="firstname" name="firstname" autoComplete="given-name" required className="border rounded px-3 py-2" />
      </div>
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
        {pending ? t("auth.registering") : t("auth.register")}
      </button>
      <Link href="/login" className="text-sm underline self-start">
        {t("auth.toLoginPage")}
      </Link>
    </form>
  );
}
