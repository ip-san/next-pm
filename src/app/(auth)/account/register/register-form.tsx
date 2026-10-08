"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction, type RegisterActionState } from "@/interface/actions/account-actions";

const initialState: RegisterActionState = { error: null, outcome: null };

export function RegisterForm({ passwordMinLength }: { passwordMinLength: number }) {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  if (state.outcome) {
    return (
      <div className="flex flex-col gap-4 w-full max-w-sm">
        <p className="text-sm">
          {state.outcome === "activation_email_sent"
            ? "確認メールを送信しました。メール内のリンクを開くとアカウントが有効になります。"
            : "登録を受け付けました。管理者がアカウントを有効化するまでお待ちください。"}
        </p>
        <Link href="/login" className="text-sm underline self-start">
          ログイン画面へ
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 w-full max-w-sm">
      <div className="flex flex-col gap-1">
        <label htmlFor="login" className="text-sm font-medium">
          ログインID
        </label>
        <input id="login" name="login" autoComplete="username" required maxLength={30} className="border rounded px-3 py-2" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          パスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className="border rounded px-3 py-2"
        />
        <span className="text-xs text-gray-500">{passwordMinLength}文字以上</span>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="lastname" className="text-sm font-medium">
          姓
        </label>
        <input id="lastname" name="lastname" autoComplete="family-name" required className="border rounded px-3 py-2" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="firstname" className="text-sm font-medium">
          名
        </label>
        <input id="firstname" name="firstname" autoComplete="given-name" required className="border rounded px-3 py-2" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="mail" className="text-sm font-medium">
          メールアドレス
        </label>
        <input id="mail" name="mail" type="email" autoComplete="email" required className="border rounded px-3 py-2" />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {pending ? "登録中…" : "登録"}
      </button>
      <Link href="/login" className="text-sm underline self-start">
        ログイン画面へ
      </Link>
    </form>
  );
}
