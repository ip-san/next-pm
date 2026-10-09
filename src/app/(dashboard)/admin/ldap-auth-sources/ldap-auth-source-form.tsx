"use client";

import { useActionState } from "react";
import {
  createLdapAuthSourceAction,
  updateLdapAuthSourceAction,
  type LdapAuthSourceActionState,
} from "@/interface/actions/ldap-auth-source-actions";
import type { LdapAuthSource } from "@/domain/ldap/auth-source";

const initialState: LdapAuthSourceActionState = { error: null };

/** The form for a new LDAP authentication source (no `source`) or for editing one. */
export function LdapAuthSourceForm({ source }: { source?: LdapAuthSource }) {
  const [state, formAction, pending] = useActionState(source ? updateLdapAuthSourceAction : createLdapAuthSourceAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-md">
      {source ? <input type="hidden" name="ldapAuthSourceId" value={source.id} /> : null}
      <label className="text-sm flex flex-col gap-1">
        名前
        <input name="name" required maxLength={60} defaultValue={source?.name ?? ""} className="border rounded px-3 py-2" />
      </label>
      <div className="flex gap-2">
        <label className="text-sm flex flex-col gap-1 flex-1">
          ホスト
          <input name="host" required defaultValue={source?.host ?? ""} className="border rounded px-3 py-2" />
        </label>
        <label className="text-sm flex flex-col gap-1 w-24">
          ポート
          <input name="port" type="number" min={1} max={65535} required defaultValue={source?.port ?? 389} className="border rounded px-3 py-2" />
        </label>
      </div>
      <label className="text-sm flex flex-col gap-1">
        バインドアカウント(DN、任意)
        <input name="account" defaultValue={source?.account ?? ""} className="border rounded px-3 py-2" />
      </label>
      <label className="text-sm flex flex-col gap-1">
        バインドのパスワード{source?.hasAccountPassword ? "(変更しない場合は空欄)" : "(任意)"}
        <input name="password" type="password" autoComplete="new-password" className="border rounded px-3 py-2" />
      </label>
      {source?.hasAccountPassword ? (
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" name="clearPassword" /> 保存されたパスワードを削除する
        </label>
      ) : null}
      <label className="text-sm flex flex-col gap-1">
        検索のベースDN
        <input name="baseDn" defaultValue={source?.baseDn ?? ""} className="border rounded px-3 py-2" />
      </label>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="flex flex-col gap-1">
          ログイン属性
          <input name="attrLogin" required defaultValue={source?.attrLogin ?? "uid"} className="border rounded px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          名の属性
          <input name="attrFirstname" defaultValue={source?.attrFirstname ?? "givenName"} className="border rounded px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          姓の属性
          <input name="attrLastname" defaultValue={source?.attrLastname ?? "sn"} className="border rounded px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          メールの属性
          <input name="attrMail" defaultValue={source?.attrMail ?? "mail"} className="border rounded px-3 py-2" />
        </label>
      </div>
      <label className="text-sm flex flex-col gap-1">
        追加のフィルタ(任意、括弧で囲む)
        <input name="filter" defaultValue={source?.filter ?? ""} className="border rounded px-3 py-2" />
      </label>
      <div className="flex flex-col gap-1 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="tls" defaultChecked={source?.tls ?? false} /> TLSで接続(ldaps)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="verifyPeer" defaultChecked={source?.verifyPeer ?? true} /> 証明書を検証する
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="onthefly" defaultChecked={source?.onthefly ?? false} /> 初回ログイン時にアカウントを作成する
        </label>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? "保存中…" : source ? "変更を保存" : "認証元を追加"}
      </button>
    </form>
  );
}
