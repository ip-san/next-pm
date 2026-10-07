"use client";

import { useActionState } from "react";
import { createRoleAction, updateRoleAction } from "@/interface/actions/admin-role-actions";
import type { AdminActionState } from "@/interface/actions/admin-action-state";
import { isBuiltinRole, setablePermissions, ROLE_BUILTIN_MEMBER, type Role } from "@/domain/role/entity";
import { MODULE_LABEL, PERMISSIONS_BY_MODULE } from "./permission-labels";

const initialState: AdminActionState = { error: null };

/**
 * Doubles as the create and the edit form.
 *
 * A builtin role (Non member / Anonymous) keeps its name and its assignable flag fixed —
 * Redmine recreates those rows by builtin value and never gives them to a project member — and
 * only shows the permissions Role#setable_permissions allows it to hold.
 */
export function RoleForm({ role, roles = [] }: { role?: Role; roles?: Role[] }) {
  const [state, formAction, pending] = useActionState(role ? updateRoleAction : createRoleAction, initialState);
  const builtin = role ? isBuiltinRole(role) : false;
  const setable = new Set(setablePermissions(role?.builtin ?? ROLE_BUILTIN_MEMBER));
  const checked = new Set(role?.permissions ?? []);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-lg border-t pt-4">
      {role ? <input type="hidden" name="roleId" value={role.id} /> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          名称
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={30}
          defaultValue={role?.name}
          readOnly={builtin}
          className="border rounded px-3 py-2 read-only:bg-gray-100"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="issuesVisibility" className="text-sm font-medium">
          チケットの参照
        </label>
        <select
          id="issuesVisibility"
          name="issuesVisibility"
          defaultValue={role?.issuesVisibility ?? "default"}
          className="border rounded px-3 py-2"
        >
          <option value="all">すべてのチケット</option>
          <option value="default">担当のチケットとウォッチしているチケット</option>
          <option value="own">自分が登録したチケットのみ</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="timeEntriesVisibility" className="text-sm font-medium">
          作業時間の参照
        </label>
        <select
          id="timeEntriesVisibility"
          name="timeEntriesVisibility"
          defaultValue={role?.timeEntriesVisibility ?? "all"}
          className="border rounded px-3 py-2"
        >
          <option value="all">すべての作業時間</option>
          <option value="own">自分が記録した作業時間のみ</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="usersVisibility" className="text-sm font-medium">
          ユーザーの参照
        </label>
        <select
          id="usersVisibility"
          name="usersVisibility"
          defaultValue={role?.usersVisibility ?? "all"}
          className="border rounded px-3 py-2"
        >
          <option value="all">すべてのアクティブなユーザー</option>
          <option value="members_of_visible_projects">参照可能なプロジェクトのメンバー</option>
        </select>
      </div>

      {builtin ? null : (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="assignable" defaultChecked={role?.assignable ?? true} />
          チケットをこのロールのユーザーに割り当て可能にする
        </label>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">権限</legend>
        {Object.entries(PERMISSIONS_BY_MODULE).map(([moduleKey, keys]) => {
          const visible = keys.filter((key) => setable.has(key));
          if (visible.length === 0) return null;
          return (
            <div key={moduleKey} className="flex flex-col gap-1">
              <p className="text-xs font-medium text-gray-600">{MODULE_LABEL[moduleKey] ?? moduleKey}</p>
              {visible.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="permissions" value={key} defaultChecked={checked.has(key)} />
                  {key}
                </label>
              ))}
            </div>
          );
        })}
      </fieldset>

      {role || roles.length === 0 ? null : (
        <div className="flex flex-col gap-1">
          <label htmlFor="copyWorkflowFrom" className="text-sm font-medium">
            ワークフローのコピー元
          </label>
          <select id="copyWorkflowFrom" name="copyWorkflowFrom" defaultValue="" className="border rounded px-3 py-2">
            <option value="">コピーしない</option>
            {roles.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50 self-start">
        {pending ? "保存中…" : role ? "変更を保存" : "ロールを追加"}
      </button>
    </form>
  );
}
