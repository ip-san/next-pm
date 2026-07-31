"use client";

import { useActionState } from "react";
import { addMemberAction, type MemberActionState } from "@/interface/actions/member-actions";
import type { Role } from "@/domain/role/entity";

const initialState: MemberActionState = { error: null };

export function AddMemberForm({ projectIdentifier, roles }: { projectIdentifier: string; roles: Role[] }) {
  const [state, formAction, pending] = useActionState(addMemberAction, initialState);

  return (
    <form action={formAction} className="flex items-end gap-3 flex-wrap border-t pt-4">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <div className="flex flex-col gap-1">
        <label htmlFor="login" className="text-sm font-medium">
          ログインID
        </label>
        <input id="login" name="login" required className="border rounded px-3 py-2" />
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">ロール</legend>
        {roles.map((role) => (
          <label key={role.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="roleIds" value={role.id} />
            {role.name}
          </label>
        ))}
      </fieldset>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600 w-full">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {pending ? "追加中…" : "メンバーを追加"}
      </button>
    </form>
  );
}
