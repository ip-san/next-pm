"use client";

import { useActionState } from "react";
import { updateMyAccountAction, type MyAccountActionState } from "@/interface/actions/my-account-actions";
import { MAIL_NOTIFICATION_LABELS, MAIL_NOTIFICATION_OPTIONS, type MailNotificationOption } from "@/domain/notification/mail-notification";
import type { CommentsSorting } from "@/domain/user-preferences/entity";

const initialState: MyAccountActionState = { error: null, ok: false };

/** Redmine ships ~50 locales; next-pm has no i18n framework, so this is the stored-only shortlist. */
const LANGUAGES: { value: string; label: string }[] = [
  { value: "", label: "(既定)" },
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

export function ProfileSection({ values }: { values: ProfileValues }) {
  const [state, formAction, pending] = useActionState(updateMyAccountAction, initialState);

  return (
    <section className="flex flex-col gap-3 border rounded p-4">
      <h2 className="font-medium">基本情報</h2>
      <form action={formAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          姓
          <input name="lastname" defaultValue={values.lastname} required className="border rounded px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          名
          <input name="firstname" defaultValue={values.firstname} required className="border rounded px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          メールアドレス
          <input name="mail" type="email" defaultValue={values.mail} required className="border rounded px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          言語
          <select name="language" defaultValue={values.language ?? ""} className="border rounded px-2 py-1">
            {LANGUAGES.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          タイムゾーン
          <select name="timeZone" defaultValue={values.timeZone ?? ""} className="border rounded px-2 py-1">
            {TIME_ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone === "" ? "(既定)" : zone}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          履歴の表示順
          <select name="commentsSorting" defaultValue={values.commentsSorting} className="border rounded px-2 py-1">
            <option value="asc">古い順</option>
            <option value="desc">新しい順</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          メール通知
          <select name="mailNotification" defaultValue={values.mailNotification} className="border rounded px-2 py-1">
            {MAIL_NOTIFICATION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {MAIL_NOTIFICATION_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="hideMail" defaultChecked={values.hideMail} />
          メールアドレスを隠す
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="noSelfNotified" defaultChecked={values.noSelfNotified} />
          自分自身による変更の通知は不要
        </label>

        {state.error ? (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
        {state.ok ? <p className="text-sm text-green-700">保存しました。</p> : null}
        <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start text-sm">
          {pending ? "保存中…" : "保存"}
        </button>
      </form>
    </section>
  );
}
