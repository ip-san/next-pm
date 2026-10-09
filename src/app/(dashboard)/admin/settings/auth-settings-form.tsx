"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { updateAuthSettingsAction, type SettingsActionState } from "@/interface/actions/settings-actions";
import { AUTOLOGIN_DAY_OPTIONS, PASSWORD_CHAR_CLASSES, type AuthSettings, type PasswordCharClass } from "@/domain/settings/auth-settings";

const initialState: SettingsActionState = { error: null };

/** Redmine's session_lifetime_options / session_timeout_options (application_helper.rb). */
const SESSION_LIFETIME_OPTIONS: { value: number; labelKey: MessageKey }[] = [
  { value: 0, labelKey: "admin.duration.unlimited" },
  { value: 60 * 2, labelKey: "admin.duration.hours2" },
  { value: 60 * 8, labelKey: "admin.duration.hours8" },
  { value: 60 * 24, labelKey: "admin.duration.day1" },
  { value: 60 * 24 * 7, labelKey: "admin.duration.days7" },
  { value: 60 * 24 * 30, labelKey: "admin.duration.days30" },
];

const SESSION_TIMEOUT_OPTIONS: { value: number; labelKey: MessageKey }[] = [
  { value: 0, labelKey: "admin.duration.unlimited" },
  { value: 15, labelKey: "admin.duration.minutes15" },
  { value: 30, labelKey: "admin.duration.minutes30" },
  { value: 60, labelKey: "admin.duration.hour1" },
  { value: 60 * 4, labelKey: "admin.duration.hours4" },
  { value: 60 * 12, labelKey: "admin.duration.hours12" },
];

const AUTOLOGIN_LABELS: Record<number, MessageKey> = {
  0: "admin.duration.off",
  1: "admin.duration.day1",
  7: "admin.duration.days7",
  30: "admin.duration.days30",
  365: "admin.duration.days365",
};

const PASSWORD_CHAR_CLASS_LABEL_KEYS: Record<PasswordCharClass, MessageKey> = {
  uppercase: "admin.charClass.uppercase",
  lowercase: "admin.charClass.lowercase",
  digits: "admin.charClass.digits",
  special_chars: "admin.charClass.special",
};

export function AuthSettingsForm({ locale = "ja", settings }: { settings: AuthSettings; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(updateAuthSettingsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="loginRequired" defaultChecked={settings.loginRequired} />
        {t("admin.auth.loginRequired")}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("admin.auth.autologin")}
        <select name="autologinDays" defaultValue={String(settings.autologinDays)} className="border rounded px-2 py-1">
          {AUTOLOGIN_DAY_OPTIONS.map((days) => (
            <option key={days} value={days}>
              {t(AUTOLOGIN_LABELS[days])}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("admin.auth.selfRegistration")}
        <select name="selfRegistration" defaultValue={settings.selfRegistration} className="border rounded px-2 py-1">
          <option value="0">{t("admin.auth.regOff")}</option>
          <option value="1">{t("admin.auth.regEmail")}</option>
          <option value="2">{t("admin.auth.regManual")}</option>
          <option value="3">{t("admin.auth.regAuto")}</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("admin.auth.passwordMinLength")}
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
        <legend>{t("admin.auth.passwordCharClasses")}</legend>
        <div className="flex flex-wrap gap-3">
          {PASSWORD_CHAR_CLASSES.map((charClass) => (
            <label key={charClass} className="flex items-center gap-1">
              <input
                type="checkbox"
                name="passwordRequiredCharClasses"
                value={charClass}
                defaultChecked={settings.passwordRequiredCharClasses.includes(charClass)}
              />
              {t(PASSWORD_CHAR_CLASS_LABEL_KEYS[charClass])}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="lostPasswordEnabled" defaultChecked={settings.lostPasswordEnabled} />
        {t("admin.auth.lostPassword")}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("admin.auth.twofa")}
        <select name="twofa" defaultValue={settings.twofa} className="border rounded px-2 py-1">
          <option value="0">{t("admin.auth.twofaOff")}</option>
          <option value="1">{t("admin.auth.twofaOptional")}</option>
          <option value="3">{t("admin.auth.twofaAdmins")}</option>
          <option value="2">{t("admin.auth.twofaAll")}</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="unsubscribeEnabled" defaultChecked={settings.unsubscribeEnabled} />
        {t("admin.auth.unsubscribe")}
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="gravatarEnabled" defaultChecked={settings.gravatarEnabled} />
        {t("admin.auth.gravatar")}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("admin.auth.sessionLifetime")}
        <select
          name="sessionLifetimeMinutes"
          defaultValue={String(settings.sessionLifetimeMinutes)}
          className="border rounded px-2 py-1"
        >
          {SESSION_LIFETIME_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("admin.auth.sessionTimeout")}
        <select
          name="sessionTimeoutMinutes"
          defaultValue={String(settings.sessionTimeoutMinutes)}
          className="border rounded px-2 py-1"
        >
          {SESSION_TIMEOUT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("admin.auth.maxAdditionalEmails")}
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
        {pending ? t("issue.saving") : t("issue.save")}
      </button>
    </form>
  );
}
