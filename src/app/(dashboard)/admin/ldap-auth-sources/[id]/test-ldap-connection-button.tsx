"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { testLdapAuthSourceConnectionAction, type LdapAuthSourceActionState } from "@/interface/actions/ldap-auth-source-actions";

const initialState: LdapAuthSourceActionState = { error: null, notice: null };

/** Redmine's "Test" link on the authentication modes list: connects with the saved settings and says how it went. */
export function TestLdapConnectionButton({ locale = "ja", id }: { id: string; locale?: Locale }) {
  const [state, formAction, pending] = useActionState(testLdapAuthSourceConnectionAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-2 items-start">
      <input type="hidden" name="ldapAuthSourceId" value={id} />
      <button type="submit" disabled={pending} className="text-sm underline disabled:opacity-50">
        {translate(locale, "admin.ldap.testConnection")}
      </button>
      {state.notice ? <p role="status" className="text-sm text-green-700">{state.notice}</p> : null}
      {state.error ? <p role="alert" className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
