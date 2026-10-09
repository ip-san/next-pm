"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { createEnumerationAction } from "@/interface/actions/admin-enumeration-actions";
import type { AdminActionState } from "@/interface/actions/admin-action-state";
import type { EnumerationType } from "@/domain/enumeration/entity";

const initialState: AdminActionState = { error: null };

export function EnumerationForm({ locale = "ja", type }: { type: EnumerationType; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(createEnumerationAction, initialState);

  return (
    <form action={formAction} className="flex items-end gap-3 flex-wrap max-w-md">
      <input type="hidden" name="type" value={type} />
      <div className="flex flex-col gap-1">
        <label htmlFor={`${type}-name`} className="text-sm font-medium">
          {t("admin.trackers.name")}
        </label>
        <input id={`${type}-name`} name="name" required maxLength={30} className="border rounded px-3 py-2" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isDefault" />
        {t("admin.enumerations.isDefault")}
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600 w-full">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {pending ? t("issue.adding") : t("issue.add")}
      </button>
    </form>
  );
}
