"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { deleteLdapAuthSourceAction, type LdapAuthSourceActionState } from "@/interface/actions/ldap-auth-source-actions";

const initialState: LdapAuthSourceActionState = { error: null };

export function DeleteLdapAuthSourceButton({ locale = "ja", id }: { id: string; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(deleteLdapAuthSourceAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-2 items-start">
      <input type="hidden" name="ldapAuthSourceId" value={id} />
      <button type="submit" disabled={pending} className="text-sm text-red-600 underline">
        {t("admin.ldap.delete")}
      </button>
      {state.error ? <p role="alert" className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
