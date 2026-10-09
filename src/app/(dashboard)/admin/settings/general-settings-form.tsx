"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { updateGeneralSettingsAction, type SettingsActionState } from "@/interface/actions/settings-actions";
import type { GeneralSettings } from "@/domain/settings/general-settings";

const initialState: SettingsActionState = { error: null };

export function GeneralSettingsForm({ locale = "ja", settings }: { settings: GeneralSettings; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(updateGeneralSettingsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      <label className="flex flex-col gap-1 text-sm">
        {t("admin.general.attachmentMaxSize")}
        <input
          type="number"
          name="attachmentMaxSizeMb"
          step="0.1"
          min="0.1"
          defaultValue={settings.attachmentMaxSizeBytes / (1024 * 1024)}
          className="border rounded px-2 py-1"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="restApiEnabled" defaultChecked={settings.restApiEnabled} />
        {t("admin.general.restApi")}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("admin.general.feedsLimit")}
        <input
          type="number"
          name="feedsLimit"
          min="1"
          step="1"
          defaultValue={settings.feedsLimit}
          className="border rounded px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("admin.general.activityDays")}
        <input
          type="number"
          name="activityDaysDefault"
          min="1"
          step="1"
          defaultValue={settings.activityDaysDefault}
          className="border rounded px-2 py-1"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="timelogAccept0Hours" defaultChecked={settings.timelogAccept0Hours} />
        {t("admin.general.timelogAccept0")}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("admin.general.repositoryLogLimit")}
        <input
          type="number"
          name="repositoryLogDisplayLimit"
          min="1"
          step="1"
          defaultValue={settings.repositoryLogDisplayLimit}
          className="border rounded px-2 py-1"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="crossProjectIssueRelations" defaultChecked={settings.crossProjectIssueRelations} />
        {t("admin.general.crossProjectRelations")}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("admin.general.doneRatio")}
        <select name="issueDoneRatio" defaultValue={settings.issueDoneRatio} className="border rounded px-2 py-1">
          <option value="issue_field">{t("admin.general.doneRatioField")}</option>
          <option value="issue_status">{t("admin.general.doneRatioStatus")}</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="webhooksEnabled" defaultChecked={settings.webhooksEnabled} />
        {t("admin.general.webhooks")}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="displaySubprojectsIssues" defaultChecked={settings.displaySubprojectsIssues} />
        {t("admin.general.subprojectIssues")}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("admin.general.defaultLanguage")}
        <select name="defaultLanguage" defaultValue={settings.defaultLanguage} className="border rounded px-3 py-2">
          <option value="ja">日本語</option>
          <option value="en">English</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="forceDefaultLanguageForAnonymous" defaultChecked={settings.forceDefaultLanguageForAnonymous} />
        {t("admin.general.forceLangAnonymous")}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="forceDefaultLanguageForLoggedIn" defaultChecked={settings.forceDefaultLanguageForLoggedIn} />
        {t("admin.general.forceLangLoggedIn")}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("admin.general.perPage")}
        <input
          name="perPageOptions"
          defaultValue={settings.perPageOptions.join(", ")}
          className="border rounded px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("admin.general.exportLimit")}
        <input
          type="number"
          min="1"
          name="issuesExportLimit"
          defaultValue={settings.issuesExportLimit}
          className="border rounded px-2 py-1"
        />
      </label>

      <fieldset className="flex flex-col gap-2 border rounded p-3">
        <legend className="text-sm font-medium px-1">{t("admin.general.parentDerive")}</legend>
        <label className="flex flex-col gap-1 text-sm">
          {t("admin.general.parentDates")}
          <select name="parentIssueDates" defaultValue={settings.parentIssueDates} className="border rounded px-2 py-1">
            <option value="independent">{t("admin.derive.independent")}</option>
            <option value="derived">{t("admin.derive.derived")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("admin.general.parentPriority")}
          <select name="parentIssuePriority" defaultValue={settings.parentIssuePriority} className="border rounded px-2 py-1">
            <option value="independent">{t("admin.derive.independent")}</option>
            <option value="derived">{t("admin.derive.derived")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("admin.general.parentDoneRatio")}
          <select name="parentIssueDoneRatio" defaultValue={settings.parentIssueDoneRatio} className="border rounded px-2 py-1">
            <option value="independent">{t("admin.derive.independent")}</option>
            <option value="derived">{t("admin.derive.derived")}</option>
          </select>
        </label>
      </fieldset>

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
