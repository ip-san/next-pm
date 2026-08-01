"use client";

import { useActionState } from "react";
import { addGroupMemberAction, type MemberActionState } from "@/interface/actions/member-actions";
import type { Group } from "@/domain/group/entity";
import type { Role } from "@/domain/role/entity";

const initialState: MemberActionState = { error: null };

export function AddGroupMemberForm({ projectIdentifier, groups, roles }: { projectIdentifier: string; groups: Group[]; roles: Role[] }) {
  const [state, formAction, pending] = useActionState(addGroupMemberAction, initialState);

  if (groups.length === 0) {
    return null;
  }

  return (
    <form action={formAction} className="flex items-end gap-3 flex-wrap border-t pt-4">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <div className="flex flex-col gap-1">
        <label htmlFor="groupId" className="text-sm font-medium">
          グループ
        </label>
        <select id="groupId" name="groupId" required className="border rounded px-3 py-2">
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
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
      <button type="submit" disabled={pending} className="border rounded px-3 py-2 disabled:opacity-50">
        {pending ? "追加中…" : "グループを追加"}
      </button>
    </form>
  );
}
