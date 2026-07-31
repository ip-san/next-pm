"use client";

import { useActionState } from "react";
import { createUserAction, type AdminActionState } from "@/interface/actions/admin-actions";

const initialState: AdminActionState = { error: null };

export function UserForm() {
  const [state, formAction, pending] = useActionState(createUserAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-sm border-t pt-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="login" className="text-sm font-medium">
          ログインID
        </label>
        <input id="login" name="login" required maxLength={30} className="border rounded px-3 py-2" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="mail" className="text-sm font-medium">
          メールアドレス
        </label>
        <input id="mail" name="mail" type="email" required className="border rounded px-3 py-2" />
      </div>
      <div className="flex gap-3">
        <div className="flex flex-col gap-1 flex-1">
          <label htmlFor="lastname" className="text-sm font-medium">
            姓
          </label>
          <input id="lastname" name="lastname" required className="border rounded px-3 py-2" />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label htmlFor="firstname" className="text-sm font-medium">
            名
          </label>
          <input id="firstname" name="firstname" required className="border rounded px-3 py-2" />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          初期パスワード
        </label>
        <input id="password" name="password" type="password" required minLength={8} className="border rounded px-3 py-2" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isAdmin" />
        管理者権限を付与する
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? "追加中…" : "ユーザーを追加"}
      </button>
    </form>
  );
}
