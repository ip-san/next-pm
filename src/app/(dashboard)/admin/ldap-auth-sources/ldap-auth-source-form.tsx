"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import {
  createLdapAuthSourceAction,
  updateLdapAuthSourceAction,
  type LdapAuthSourceActionState,
} from "@/interface/actions/ldap-auth-source-actions";
import type { LdapAuthSource } from "@/domain/ldap/auth-source";

const initialState: LdapAuthSourceActionState = { error: null };

/** The form for a new LDAP authentication source (no `source`) or for editing one. */
export function LdapAuthSourceForm({ locale = "ja", source }: { source?: LdapAuthSource; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(source ? updateLdapAuthSourceAction : createLdapAuthSourceAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-md">
      {source ? <input type="hidden" name="ldapAuthSourceId" value={source.id} /> : null}
      <label className="text-sm flex flex-col gap-1">
        {t("admin.ldap.name")}
        <input name="name" required maxLength={60} defaultValue={source?.name ?? ""} className="border rounded px-3 py-2" />
      </label>
      <div className="flex gap-2">
        <label className="text-sm flex flex-col gap-1 flex-1">
          {t("admin.ldap.host")}
          <input name="host" required defaultValue={source?.host ?? ""} className="border rounded px-3 py-2" />
        </label>
        <label className="text-sm flex flex-col gap-1 w-24">
          {t("admin.ldap.port")}
          <input name="port" type="number" min={1} max={65535} required defaultValue={source?.port ?? 389} className="border rounded px-3 py-2" />
        </label>
      </div>
      <label className="text-sm flex flex-col gap-1">
        {t("admin.ldap.account")}
        <input name="account" defaultValue={source?.account ?? ""} className="border rounded px-3 py-2" />
      </label>
      <label className="text-sm flex flex-col gap-1">
        {t("admin.ldap.password")}{source?.hasAccountPassword ? t("admin.ldap.passwordKeep") : t("admin.ldap.passwordOptional")}
        <input name="password" type="password" autoComplete="new-password" className="border rounded px-3 py-2" />
      </label>
      {source?.hasAccountPassword ? (
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" name="clearPassword" /> {t("admin.ldap.clearPassword")}
        </label>
      ) : null}
      <label className="text-sm flex flex-col gap-1">
        {t("admin.ldap.baseDn")}
        <input name="baseDn" defaultValue={source?.baseDn ?? ""} className="border rounded px-3 py-2" />
      </label>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="flex flex-col gap-1">
          {t("admin.ldap.attrLogin")}
          <input name="attrLogin" required defaultValue={source?.attrLogin ?? "uid"} className="border rounded px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          {t("admin.ldap.attrFirstname")}
          <input name="attrFirstname" defaultValue={source?.attrFirstname ?? "givenName"} className="border rounded px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          {t("admin.ldap.attrLastname")}
          <input name="attrLastname" defaultValue={source?.attrLastname ?? "sn"} className="border rounded px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          {t("admin.ldap.attrMail")}
          <input name="attrMail" defaultValue={source?.attrMail ?? "mail"} className="border rounded px-3 py-2" />
        </label>
      </div>
      <label className="text-sm flex flex-col gap-1">
        {t("admin.ldap.filter")}
        <input name="filter" defaultValue={source?.filter ?? ""} className="border rounded px-3 py-2" />
      </label>
      <div className="flex flex-col gap-1 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="tls" defaultChecked={source?.tls ?? false} /> {t("admin.ldap.tls")}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="verifyPeer" defaultChecked={source?.verifyPeer ?? true} /> {t("admin.ldap.verifyPeer")}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="onthefly" defaultChecked={source?.onthefly ?? false} /> {t("admin.ldap.onthefly")}
        </label>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? t("issue.saving") : source ? t("admin.users.saveChanges") : t("admin.ldap.add")}
      </button>
    </form>
  );
}
