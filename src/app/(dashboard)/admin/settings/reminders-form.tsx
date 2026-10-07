"use client";

import { useActionState } from "react";
import { enqueueRemindersAction, type RemindersActionState } from "@/interface/actions/settings-actions";

const initialState: RemindersActionState = { error: null, queued: false };

export function RemindersForm() {
  const [state, formAction, pending] = useActionState(enqueueRemindersAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      <label className="flex flex-col gap-1 text-sm">
        対象とする日数
        <input type="number" name="days" min="1" step="1" defaultValue={7} className="border rounded px-2 py-1" />
        <span className="text-xs text-gray-500">
          この日数以内に期日を迎える未完了のチケットを、担当者ごとにまとめてメールします。
        </span>
      </label>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.queued ? <p className="text-sm text-green-700">リマインダーの送信をキューに登録しました。</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start"
      >
        {pending ? "登録中…" : "いま送信する"}
      </button>
    </form>
  );
}
