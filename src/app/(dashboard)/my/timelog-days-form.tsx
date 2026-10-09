"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { updateTimelogDaysAction, type MyPageActionState } from "@/interface/actions/my-page-actions";

const initialState: MyPageActionState = { error: null };

export function TimelogDaysForm({ locale = "ja", days }: { days: number; locale?: Locale }) {
  const [state, formAction, pending] = useActionState(updateTimelogDaysAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2 text-xs text-gray-500">
      {translate(locale, "my.past")}
      <input type="number" name="days" defaultValue={days} min={1} max={365} className="border rounded w-16 px-1 py-0.5" />
      {translate(locale, "my.dayUnit")}
      <button type="submit" disabled={pending} className="underline">
        {translate(locale, "my.change")}
      </button>
      {state.error ? <span className="text-red-600">{state.error}</span> : null}
    </form>
  );
}
