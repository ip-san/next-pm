"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { changePasswordAction, type ChangePasswordActionState } from "@/interface/actions/auth-actions";

const initialState: ChangePasswordActionState = { error: null, ok: false };

export function PasswordSection({ authSource }: { authSource: "ldap" | null }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Server Actions revalidate the page's cache but don't push new props into this already-
  // mounted client component — refresh so any other account data catches up, and clear the
  // form fields since a successful change shouldn't leave the old password sitting in memory.
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.ok, router]);

  if (authSource === "ldap") {
    return (
      <section className="flex flex-col gap-3 border rounded p-4">
        <h2 className="font-medium">パスワード</h2>
        <p className="text-sm text-gray-600">LDAP認証のアカウントのため、ここからはパスワードを変更できません。</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 border rounded p-4">
      <h2 className="font-medium">パスワード</h2>
      <form ref={formRef} action={formAction} className="flex flex-col gap-2">
        <label htmlFor="currentPassword" className="text-sm font-medium">
          現在のパスワード
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className="border rounded px-3 py-2"
        />
        <label htmlFor="newPassword" className="text-sm font-medium">
          新しいパスワード
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
        {state.error ? (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
        {state.ok ? <p className="text-sm text-green-700">パスワードを変更しました。</p> : null}
        <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start text-sm">
          {pending ? "変更中…" : "パスワードを変更する"}
        </button>
      </form>
    </section>
  );
}
