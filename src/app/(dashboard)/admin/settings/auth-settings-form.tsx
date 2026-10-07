"use client";

import { useActionState } from "react";
import { updateAuthSettingsAction, type SettingsActionState } from "@/interface/actions/settings-actions";
import { AUTOLOGIN_DAY_OPTIONS, PASSWORD_CHAR_CLASSES, type AuthSettings } from "@/domain/settings/auth-settings";
import { PASSWORD_CHAR_CLASS_LABELS } from "@/domain/user/password-policy";

const initialState: SettingsActionState = { error: null };

/** Redmine's session_lifetime_options / session_timeout_options (application_helper.rb). */
const SESSION_LIFETIME_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "無制限" },
  { value: 60 * 2, label: "2時間" },
  { value: 60 * 8, label: "8時間" },
  { value: 60 * 24, label: "1日" },
  { value: 60 * 24 * 7, label: "7日" },
  { value: 60 * 24 * 30, label: "30日" },
];

const SESSION_TIMEOUT_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "無制限" },
  { value: 15, label: "15分" },
  { value: 30, label: "30分" },
  { value: 60, label: "1時間" },
  { value: 60 * 4, label: "4時間" },
  { value: 60 * 12, label: "12時間" },
];

const AUTOLOGIN_LABELS: Record<number, string> = { 0: "無効", 1: "1日", 7: "7日", 30: "30日", 365: "365日" };

export function AuthSettingsForm({ settings }: { settings: AuthSettings }) {
  const [state, formAction, pending] = useActionState(updateAuthSettingsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="loginRequired" defaultChecked={settings.loginRequired} />
        認証が必要（未ログインでは何も閲覧できない）
      </label>

      <label className="flex flex-col gap-1 text-sm">
        自動ログイン
        <select name="autologinDays" defaultValue={String(settings.autologinDays)} className="border rounded px-2 py-1">
          {AUTOLOGIN_DAY_OPTIONS.map((days) => (
            <option key={days} value={days}>
              {AUTOLOGIN_LABELS[days]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        ユーザーによるアカウント登録
        <select name="selfRegistration" defaultValue={settings.selfRegistration} className="border rounded px-2 py-1">
          <option value="0">無効</option>
          <option value="1">メールでアカウントを有効化</option>
          <option value="2">管理者による手動アカウント有効化</option>
          <option value="3">自動でアカウントを有効化</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        パスワードの最低必要文字数
        <input
          type="number"
          name="passwordMinLength"
          min="1"
          step="1"
          defaultValue={settings.passwordMinLength}
          className="border rounded px-2 py-1"
        />
      </label>

      <fieldset className="flex flex-col gap-1 text-sm">
        <legend>パスワードに含める文字の種類</legend>
        <div className="flex flex-wrap gap-3">
          {PASSWORD_CHAR_CLASSES.map((charClass) => (
            <label key={charClass} className="flex items-center gap-1">
              <input
                type="checkbox"
                name="passwordRequiredCharClasses"
                value={charClass}
                defaultChecked={settings.passwordRequiredCharClasses.includes(charClass)}
              />
              {PASSWORD_CHAR_CLASS_LABELS[charClass]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="lostPasswordEnabled" defaultChecked={settings.lostPasswordEnabled} />
        パスワード再設定を許可する
      </label>

      <label className="flex flex-col gap-1 text-sm">
        二要素認証
        <select name="twofa" defaultValue={settings.twofa} className="border rounded px-2 py-1">
          <option value="0">無効</option>
          <option value="1">任意</option>
          <option value="3">システム管理者に必須</option>
          <option value="2">全ユーザーに必須</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="unsubscribeEnabled" defaultChecked={settings.unsubscribeEnabled} />
        ユーザー自身によるアカウント削除を許可する
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="gravatarEnabled" defaultChecked={settings.gravatarEnabled} />
        Gravatarのアイコンを使用する
      </label>

      <label className="flex flex-col gap-1 text-sm">
        セッションの最大有効期間
        <select
          name="sessionLifetimeMinutes"
          defaultValue={String(settings.sessionLifetimeMinutes)}
          className="border rounded px-2 py-1"
        >
          {SESSION_LIFETIME_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        無操作タイムアウト
        <select
          name="sessionTimeoutMinutes"
          defaultValue={String(settings.sessionTimeoutMinutes)}
          className="border rounded px-2 py-1"
        >
          {SESSION_TIMEOUT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        1ユーザーあたりの追加メールアドレス数の上限
        <input
          type="number"
          name="maxAdditionalEmails"
          min="0"
          step="1"
          defaultValue={settings.maxAdditionalEmails}
          className="border rounded px-2 py-1"
        />
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
