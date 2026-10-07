"use client";

import { useActionState } from "react";
import { updateMailHandlerSettingsAction, type SettingsActionState } from "@/interface/actions/settings-actions";
import type { MailHandlerSettings } from "@/domain/settings/mail-handler-settings";

const initialState: SettingsActionState = { error: null };

export function MailHandlerSettingsForm({ settings }: { settings: MailHandlerSettings }) {
  const [state, formAction, pending] = useActionState(updateMailHandlerSettingsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="apiEnabled" defaultChecked={settings.apiEnabled} />
        受信メールのWebサービスを有効にする
      </label>
      <label className="flex flex-col gap-1 text-sm">
        APIキー
        <input type="text" name="apiKey" defaultValue={settings.apiKey} className="border rounded px-2 py-1" />
        <span className="text-xs text-gray-500">
          空欄の場合は環境変数 MAIL_HANDLER_API_KEY を使います。どちらも未設定なら受信は拒否されます。
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        優先する本文パート
        <select name="preferredBodyPart" defaultValue={settings.preferredBodyPart} className="border rounded px-2 py-1">
          <option value="plain">テキスト（text/plain）</option>
          <option value="html">HTML（text/html）</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        本文の区切り文字
        <textarea
          name="bodyDelimiters"
          rows={3}
          defaultValue={settings.bodyDelimiters}
          className="border rounded px-2 py-1 font-mono"
        />
        <span className="text-xs text-gray-500">
          1行に1つ。この行以降の本文（署名や引用）は切り捨てます。
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enableRegexDelimiters" defaultChecked={settings.enableRegexDelimiters} />
        区切り文字を正規表現として扱う
      </label>
      <label className="flex flex-col gap-1 text-sm">
        除外する添付ファイル名
        <input
          type="text"
          name="excludedFilenames"
          defaultValue={settings.excludedFilenames}
          className="border rounded px-2 py-1 font-mono"
        />
        <span className="text-xs text-gray-500">カンマ区切り。`*` は任意の文字列にマッチします（例: smime.p7s, *.vcf）。</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="enableRegexExcludedFilenames"
          defaultChecked={settings.enableRegexExcludedFilenames}
        />
        除外するファイル名を正規表現として扱う
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
