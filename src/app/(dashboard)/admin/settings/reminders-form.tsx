"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { enqueueRemindersAction, type RemindersActionState } from "@/interface/actions/settings-actions";

const initialState: RemindersActionState = { error: null, queued: false };

export function RemindersForm({ locale = "ja" }: { locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(enqueueRemindersAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      <label className="flex flex-col gap-1 text-sm">
        {t("admin.reminders.days")}
        <input type="number" name="days" min="1" step="1" defaultValue={7} className="border rounded px-2 py-1" />
        <span className="text-xs text-gray-500">
          {t("admin.reminders.daysHelp")}
        </span>
      </label>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.queued ? <p className="text-sm text-green-700">{t("admin.reminders.queued")}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start"
      >
        {pending ? t("admin.reminders.queuing") : t("admin.reminders.submit")}
      </button>
    </form>
  );
}
