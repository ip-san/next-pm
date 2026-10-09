"use client";

import { useActionState, useState } from "react";
import { createUserAction, updateUserAction } from "@/interface/actions/admin-user-actions";
import type { AdminActionState } from "@/interface/actions/admin-action-state";
import type { User } from "@/domain/user/entity";
import { ENV_LDAP_AUTH_MODE, INTERNAL_AUTH_MODE } from "@/domain/user/auth-mode";

export interface AuthModeOptionsView {
  envLdapConfigured: boolean;
  ldapSources: { id: string; name: string }[];
}

/** The select shows what the account is bound to now, so a stored env-bound account is never silently reset to internal. */
function initialAuthMode(user: User | undefined): string {
  if (!user || user.authSource !== "ldap") {
    return INTERNAL_AUTH_MODE;
  }
  return user.ldapAuthSourceId ?? ENV_LDAP_AUTH_MODE;
}

const initialState: AdminActionState = { error: null };

/**
 * Doubles as the create and the edit form.
 *
 * On edit the password field is optional — Redmine's UsersController#update only sets a
 * password when one was actually submitted — except when a directory account is moved back to
 * internal authentication, which needs one. The admin checkbox disappears for the acting
 * admin's own row, so they cannot demote themselves out of the admin area.
 */
export function UserForm({
  user,
  isSelf = false,
  authModeOptions,
}: {
  user?: User;
  isSelf?: boolean;
  authModeOptions: AuthModeOptionsView;
}) {
  const [state, formAction, pending] = useActionState(user ? updateUserAction : createUserAction, initialState);
  const [authMode, setAuthMode] = useState(initialAuthMode(user));
  const isInternal = authMode === INTERNAL_AUTH_MODE;
  // An LDAP-backed account has no local password at all, so the field stops being mandatory
  // the moment a directory is chosen — Redmine's create form skips it the same way. Going the
  // other way (a directory account becoming internal) it is required, as the action enforces.
  const passwordRequired = isInternal && (!user || user.authSource === "ldap");
  // The environment source is listed only when it is configured, or when this account already uses it,
  // so the select can show the stored value (the action then refuses it, prompting a deliberate change).
  const showEnvOption = authModeOptions.envLdapConfigured || authMode === ENV_LDAP_AUTH_MODE;

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-sm border-t pt-4">
      {user ? <input type="hidden" name="userId" value={user.id} /> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="login" className="text-sm font-medium">
          ログインID
        </label>
        <input
          id="login"
          name="login"
          required
          maxLength={30}
          defaultValue={user?.login}
          className="border rounded px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="mail" className="text-sm font-medium">
          メールアドレス
        </label>
        <input
          id="mail"
          name="mail"
          type="email"
          required
          defaultValue={user?.mail}
          className="border rounded px-3 py-2"
        />
      </div>
      <div className="flex gap-3">
        <div className="flex flex-col gap-1 flex-1">
          <label htmlFor="lastname" className="text-sm font-medium">
            姓
          </label>
          <input
            id="lastname"
            name="lastname"
            required
            defaultValue={user?.lastname}
            className="border rounded px-3 py-2"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label htmlFor="firstname" className="text-sm font-medium">
            名
          </label>
          <input
            id="firstname"
            name="firstname"
            required
            defaultValue={user?.firstname}
            className="border rounded px-3 py-2"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="authMode" className="text-sm font-medium">
          認証方式
        </label>
        <select
          id="authMode"
          name="authMode"
          value={authMode}
          onChange={(event) => setAuthMode(event.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value={INTERNAL_AUTH_MODE}>内部(パスワード)</option>
          {showEnvOption ? <option value={ENV_LDAP_AUTH_MODE}>LDAP(環境変数の設定)</option> : null}
          {authModeOptions.ldapSources.map((source) => (
            <option key={source.id} value={source.id}>
              LDAP: {source.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          パスワード
          {!isInternal ? "(LDAP認証では不要)" : user?.authSource === "ldap" ? "(内部認証への切り替えには必須)" : user ? "(変更する場合のみ)" : ""}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required={passwordRequired}
          disabled={!isInternal}
          minLength={8}
          autoComplete="new-password"
          className="border rounded px-3 py-2 disabled:bg-gray-100"
        />
      </div>
      {isSelf ? null : (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isAdmin" defaultChecked={user?.isAdmin} />
          システム管理者
        </label>
      )}
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {pending ? "保存中…" : user ? "変更を保存" : "ユーザーを追加"}
      </button>
    </form>
  );
}
