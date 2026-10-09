"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { updateMailHandlerSettingsAction, type SettingsActionState } from "@/interface/actions/settings-actions";
import type { MailHandlerSettings } from "@/domain/settings/mail-handler-settings";

const initialState: SettingsActionState = { error: null };

export function MailHandlerSettingsForm({ locale = "ja", settings }: { settings: MailHandlerSettings; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(updateMailHandlerSettingsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="apiEnabled" defaultChecked={settings.apiEnabled} />
        {t("admin.mail.apiEnabled")}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("admin.mail.apiKey")}
        <input type="text" name="apiKey" defaultValue={settings.apiKey} className="border rounded px-2 py-1" />
        <span className="text-xs text-gray-500">
          {t("admin.mail.apiKeyHelp")}
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("admin.mail.preferredBodyPart")}
        <select name="preferredBodyPart" defaultValue={settings.preferredBodyPart} className="border rounded px-2 py-1">
          <option value="plain">{t("admin.mail.partPlain")}</option>
          <option value="html">{t("admin.mail.partHtml")}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("admin.mail.bodyDelimiters")}
        <textarea
          name="bodyDelimiters"
          rows={3}
          defaultValue={settings.bodyDelimiters}
          className="border rounded px-2 py-1 font-mono"
        />
        <span className="text-xs text-gray-500">
          {t("admin.mail.bodyDelimitersHelp")}
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enableRegexDelimiters" defaultChecked={settings.enableRegexDelimiters} />
        {t("admin.mail.regexDelimiters")}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("admin.mail.excludedFilenames")}
        <input
          type="text"
          name="excludedFilenames"
          defaultValue={settings.excludedFilenames}
          className="border rounded px-2 py-1 font-mono"
        />
        <span className="text-xs text-gray-500">{t("admin.mail.excludedFilenamesHelp")}</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="enableRegexExcludedFilenames"
          defaultChecked={settings.enableRegexExcludedFilenames}
        />
        {t("admin.mail.regexExcluded")}
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
