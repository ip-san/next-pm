"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { updateMyAccountAction, type MyAccountActionState } from "@/interface/actions/my-account-actions";
import { MAIL_NOTIFICATION_OPTIONS, type MailNotificationOption } from "@/domain/notification/mail-notification";
import type { CommentsSorting } from "@/domain/user-preferences/entity";

const initialState: MyAccountActionState = { error: null, ok: false };

/** Redmine ships ~50 locales; next-pm has no i18n framework, so this is the stored-only shortlist. */
const LANGUAGES: { value: string; label: string }[] = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
];

/** A small, useful subset rather than the full IANA list, which would be an unusable <select>. */
const TIME_ZONES = ["", "Asia/Tokyo", "UTC", "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles"];

export interface ProfileValues {
  firstname: string;
  lastname: string;
  mail: string;
  language: string | null;
  mailNotification: MailNotificationOption;
  hideMail: boolean;
  timeZone: string | null;
  commentsSorting: CommentsSorting;
  noSelfNotified: boolean;
}

export function ProfileSection({ locale = "ja", values }: { values: ProfileValues; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(updateMyAccountAction, initialState);

  return (
    <section className="flex flex-col gap-3 border rounded p-4">
      <h2 className="font-medium">{translate(locale, "account.basicInfo")}</h2>
      <form action={formAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          {translate(locale, "account.lastname")}
          <input name="lastname" defaultValue={values.lastname} required className="border rounded px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {translate(locale, "account.firstname")}
          <input name="firstname" defaultValue={values.firstname} required className="border rounded px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {translate(locale, "account.mail")}
          <input name="mail" type="email" defaultValue={values.mail} required className="border rounded px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {translate(locale, "account.language")}
          <select name="language" defaultValue={values.language ?? ""} className="border rounded px-2 py-1">
            {LANGUAGES.map((language) => (
              <option key={language.value} value={language.value}>
                {language.value === "" ? translate(locale, "account.defaultOption") : language.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {translate(locale, "account.timezone")}
          <select name="timeZone" defaultValue={values.timeZone ?? ""} className="border rounded px-2 py-1">
            {TIME_ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone === "" ? translate(locale, "account.defaultOption") : zone}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {translate(locale, "account.journalOrder")}
          <select name="commentsSorting" defaultValue={values.commentsSorting} className="border rounded px-2 py-1">
            <option value="asc">{translate(locale, "account.oldestFirst")}</option>
            <option value="desc">{translate(locale, "account.newestFirst")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {translate(locale, "account.mailNotification")}
          <select name="mailNotification" defaultValue={values.mailNotification} className="border rounded px-2 py-1">
            {MAIL_NOTIFICATION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {t(`my.mailNotification.${option}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="hideMail" defaultChecked={values.hideMail} />
          {translate(locale, "account.hideEmail")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="noSelfNotified" defaultChecked={values.noSelfNotified} />
          {translate(locale, "account.noSelfNotify")}
        </label>

        {state.error ? (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
        {state.ok ? <p className="text-sm text-green-700">{translate(locale, "account.saved")}</p> : null}
        <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start text-sm">
          {pending ? t("issue.saving") : t("issue.save")}
        </button>
      </form>
    </section>
  );
}
