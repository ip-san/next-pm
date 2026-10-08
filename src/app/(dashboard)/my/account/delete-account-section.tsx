"use client";

import { useActionState } from "react";
import { deleteOwnAccountAction, type MyAccountActionState } from "@/interface/actions/my-account-actions";

const initialState: MyAccountActionState = { error: null, ok: false };

/**
 * Redmine's MyController#destroy, shown only when User#own_account_deletable? holds — the
 * `unsubscribe` setting is on, and the user is not the last active administrator.
 */
export function DeleteAccountSection() {
  const [state, formAction, pending] = useActionState(deleteOwnAccountAction, initialState);

  return (
    <section className="flex flex-col gap-3 border border-red-300 rounded p-4">
      <h2 className="font-medium text-red-700">アカウントの削除</h2>
      <p className="text-sm text-gray-600">
        アカウントを削除すると元に戻せません。作成したチケット・コメント・添付ファイルは匿名ユーザーに引き継がれ、担当や
        ウォッチ、個人設定は削除されます。
      </p>
      <form action={formAction} className="flex flex-col gap-2">
        <label htmlFor="confirm" className="text-sm font-medium">
          確認のため <code>DELETE</code> と入力してください
        </label>
        <input id="confirm" name="confirm" autoComplete="off" required className="border rounded px-3 py-2" />
        {state.error ? (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="bg-red-700 text-white rounded px-3 py-2 disabled:opacity-50 self-start text-sm"
        >
          {pending ? "削除中…" : "アカウントを削除する"}
        </button>
      </form>
    </section>
  );
}
