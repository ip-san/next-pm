"use client";

import { useActionState } from "react";
import { lostPasswordAction, type LostPasswordActionState } from "@/interface/actions/auth-actions";

const initialState: LostPasswordActionState = { error: null, success: false };

export function LostPasswordRequestForm() {
  const [state, formAction, pending] = useActionState(lostPasswordAction, initialState);

  if (state.success) {
    return (
      <p className="text-sm w-full max-w-sm">
        入力されたメールアドレス宛にパスワード再設定用のリンクを送信しました（該当するアカウントが存在する場合）。しばらくして届かない場合は、メールアドレスをご確認のうえ再度お試しください。
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 w-full max-w-sm">
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
        {pending ? "送信中…" : "パスワード再設定メールを送信"}
      </button>
    </form>
  );
}
