"use client";

import { useActionState } from "react";
import { createUserAction, updateUserAction } from "@/interface/actions/admin-user-actions";
import type { AdminActionState } from "@/interface/actions/admin-action-state";
import type { User } from "@/domain/user/entity";

const initialState: AdminActionState = { error: null };

/**
 * Doubles as the create and the edit form.
 *
 * On edit the password field is optional — Redmine's UsersController#update only sets a
 * password when one was actually submitted — and the admin checkbox disappears for the acting
 * admin's own row, so they cannot demote themselves out of the admin area.
 */
export function UserForm({ user, isSelf = false }: { user?: User; isSelf?: boolean }) {
  const [state, formAction, pending] = useActionState(user ? updateUserAction : createUserAction, initialState);

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
        <label htmlFor="authSource" className="text-sm font-medium">
          認証方式
        </label>
        <select id="authSource" name="authSource" defaultValue={user?.authSource ?? ""} className="border rounded px-3 py-2">
          <option value="">内部(パスワード)</option>
          <option value="ldap">LDAP</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          パスワード{user ? "(変更する場合のみ)" : ""}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required={!user}
          minLength={8}
          autoComplete="new-password"
          className="border rounded px-3 py-2"
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
