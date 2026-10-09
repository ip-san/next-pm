"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type LoginActionState } from "@/interface/actions/auth-actions";

const initialState: LoginActionState = { error: null };

export function LoginForm({
  autologinEnabled,
  lostPasswordEnabled,
  selfRegistrationEnabled,
  labels,
}: {
  autologinEnabled: boolean;
  lostPasswordEnabled: boolean;
  selfRegistrationEnabled: boolean;
  /** The sign-in form's text, translated by the page for the request's language. */
  labels: { loginId: string; password: string; rememberMe: string; submit: string; submitting: string; lostPassword: string };
}) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 w-full max-w-sm">
      <div className="flex flex-col gap-1">
        <label htmlFor="login" className="text-sm font-medium">
          {labels.loginId}
        </label>
        <input
          id="login"
          name="login"
          autoComplete="username"
          required
          className="border rounded px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          {labels.password}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="border rounded px-3 py-2"
        />
      </div>
      {autologinEnabled ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="rememberMe" />
          {labels.rememberMe}
        </label>
      ) : null}
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
        {pending ? labels.submitting : labels.submit}
      </button>
      {lostPasswordEnabled ? (
        <Link href="/account/lost_password" className="text-sm underline self-start">
          {labels.lostPassword}
        </Link>
      ) : null}
      {selfRegistrationEnabled ? (
        <Link href="/account/register" className="text-sm underline self-start">
          アカウントを登録する
        </Link>
      ) : null}
    </form>
  );
}
