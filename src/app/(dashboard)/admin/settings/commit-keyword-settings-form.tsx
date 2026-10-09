"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { updateCommitKeywordSettingsAction, type SettingsActionState } from "@/interface/actions/settings-actions";
import type { CommitKeywordSettings } from "@/domain/settings/commit-keywords";

const initialState: SettingsActionState = { error: null };

export function CommitKeywordSettingsForm({ locale = "ja", settings }: { settings: CommitKeywordSettings; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(updateCommitKeywordSettingsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      <label className="flex flex-col gap-1 text-sm">
        {t("admin.commit.refKeywords1")}<code>*</code>{t("admin.commit.refKeywords2")}
        <input
          type="text"
          name="refKeywords"
          defaultValue={settings.keywordScanOptions.refKeywords.join(",")}
          className="border rounded px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("admin.commit.fixKeywords")}
        <input
          type="text"
          name="fixKeywords"
          defaultValue={settings.keywordScanOptions.fixKeywords.join(",")}
          className="border rounded px-2 py-1"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="logtimeEnabled" defaultChecked={settings.logtimeEnabled} />
        {t("admin.commit.logtime1")}<code>@1h30</code>{t("admin.commit.logtime2")}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="crossProjectRef" defaultChecked={settings.crossProjectRef} />
        {t("admin.commit.crossProject")}
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
