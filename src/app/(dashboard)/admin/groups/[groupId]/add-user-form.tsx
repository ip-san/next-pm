"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { addUserToGroupAction, type GroupActionState } from "@/interface/actions/group-actions";

const initialState: GroupActionState = { error: null };

export function AddUserToGroupForm({ locale = "ja", groupId }: { groupId: string; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(addUserToGroupAction, initialState);

  return (
    <form action={formAction} className="flex items-end gap-2 border-t pt-4">
      <input type="hidden" name="groupId" value={groupId} />
      <div className="flex flex-col gap-1">
        <label htmlFor="login" className="text-sm font-medium">
          {t("login.loginId")}
        </label>
        <input id="login" name="login" required className="border rounded px-3 py-2 text-sm" />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="border rounded px-3 py-2 text-sm disabled:opacity-50">
        {pending ? t("issue.adding") : t("admin.users.add")}
      </button>
    </form>
  );
}
