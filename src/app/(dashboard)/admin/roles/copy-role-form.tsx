"use client";

import { useActionState } from "react";
import { copyRoleAction } from "@/interface/actions/admin-role-actions";
import type { AdminActionState } from "@/interface/actions/admin-action-state";
import type { Role } from "@/domain/role/entity";

const initialState: AdminActionState = { error: null };

/** Redmine's `roles/new?copy=<id>`: a new ordinary role prefilled from an existing one. */
export function CopyRoleForm({ roles }: { roles: Role[] }) {
  const [state, formAction, pending] = useActionState(copyRoleAction, initialState);

  return (
    <form action={formAction} className="flex items-end gap-3 flex-wrap max-w-lg border-t pt-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="sourceRoleId" className="text-sm font-medium">
          コピー元のロール
        </label>
        <select id="sourceRoleId" name="sourceRoleId" required defaultValue="" className="border rounded px-3 py-2">
          <option value="">選択してください</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="copy-name" className="text-sm font-medium">
          新しいロール名
        </label>
        <input id="copy-name" name="name" required maxLength={30} className="border rounded px-3 py-2" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="copyWorkflow" />
        ワークフローもコピー
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600 w-full">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="border rounded px-3 py-2 disabled:opacity-50">
        {pending ? "コピー中…" : "ロールをコピー"}
      </button>
    </form>
  );
}
