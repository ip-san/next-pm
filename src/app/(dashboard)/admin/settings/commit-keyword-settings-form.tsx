"use client";

import { useActionState } from "react";
import { updateCommitKeywordSettingsAction, type SettingsActionState } from "@/interface/actions/settings-actions";
import type { CommitKeywordSettings } from "@/domain/settings/commit-keywords";

const initialState: SettingsActionState = { error: null };

export function CommitKeywordSettingsForm({ settings }: { settings: CommitKeywordSettings }) {
  const [state, formAction, pending] = useActionState(updateCommitKeywordSettingsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      <label className="flex flex-col gap-1 text-sm">
        参照キーワード（カンマ区切り、<code>*</code> でキーワードなしの参照も許可）
        <input
          type="text"
          name="refKeywords"
          defaultValue={settings.keywordScanOptions.refKeywords.join(",")}
          className="border rounded px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        クローズキーワード（カンマ区切り）
        <input
          type="text"
          name="fixKeywords"
          defaultValue={settings.keywordScanOptions.fixKeywords.join(",")}
          className="border rounded px-2 py-1"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="logtimeEnabled" defaultChecked={settings.logtimeEnabled} />
        コミットメッセージの <code>@1h30</code> 等から作業時間を自動記録する
      </label>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start"
      >
        {pending ? "保存中…" : "保存"}
      </button>
    </form>
  );
}
