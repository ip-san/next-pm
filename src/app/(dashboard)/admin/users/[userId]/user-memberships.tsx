"use client";

import { useActionState } from "react";
import {
  addUserMembershipAction,
  removeUserMembershipAction,
  updateUserMembershipAction,
} from "@/interface/actions/admin-user-actions";
import type { AdminActionState } from "@/interface/actions/admin-action-state";
import type { Member } from "@/domain/member/entity";
import type { Project } from "@/domain/project/entity";
import type { Role } from "@/domain/role/entity";

const initialState: AdminActionState = { error: null };

type MembershipRow = { member: Member; project: Project | undefined };

/** One membership row: its role set is editable unless the row came from a group. */
function MembershipRowControls({
  userId,
  member,
  roles,
  editable,
}: {
  userId: string;
  member: Member;
  roles: Role[];
  editable: boolean;
}) {
  const [updateState, updateFormAction, updating] = useActionState(updateUserMembershipAction, initialState);
  const [removeState, removeFormAction, removing] = useActionState(removeUserMembershipAction, initialState);
  const error = updateState.error ?? removeState.error;
  const current = new Set(member.roleIds);

  if (!editable) {
    return (
      <span className="text-sm text-gray-500">
        {roles
          .filter((role) => current.has(role.id))
          .map((role) => role.name)
          .join(", ")}
        （グループから継承）
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-3 text-sm">
      <form action={updateFormAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="memberId" value={member.id} />
        {roles.map((role) => (
          <label key={role.id} className="flex items-center gap-1">
            <input type="checkbox" name="roleIds" value={role.id} defaultChecked={current.has(role.id)} />
            {role.name}
          </label>
        ))}
        <button type="submit" disabled={updating} className="border rounded px-2 py-1 disabled:opacity-50">
          {updating ? "保存中…" : "保存"}
        </button>
      </form>
      <form action={removeFormAction}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="memberId" value={member.id} />
        <button type="submit" disabled={removing} className="text-red-700 underline disabled:opacity-50">
          {removing ? "削除中…" : "削除"}
        </button>
      </form>
      {error ? (
        <span role="alert" className="text-red-600">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Redmine's PrincipalMembershipsController rendered as the user's プロジェクト tab. */
export function UserMemberships({
  userId,
  rows,
  roles,
  joinableProjects,
}: {
  userId: string;
  rows: MembershipRow[];
  roles: Role[];
  joinableProjects: Project[];
}) {
  const [state, formAction, pending] = useActionState(addUserMembershipAction, initialState);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">プロジェクト</h2>
      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="pr-4 py-1">プロジェクト</th>
            <th className="pr-4 py-1">ロール</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ member, project }) => (
            <tr key={member.id} className="border-b align-top">
              <td className="pr-4 py-1">{project?.name ?? "?"}</td>
              <td className="pr-4 py-1">
                <MembershipRowControls
                  userId={userId}
                  member={member}
                  roles={roles}
                  editable={member.inheritedFromMemberId === null}
                />
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={2} className="text-gray-400 py-2">
                所属しているプロジェクトはありません。
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {joinableProjects.length === 0 ? null : (
        <form action={formAction} className="flex flex-wrap items-end gap-3 border-t pt-3">
          <input type="hidden" name="userId" value={userId} />
          <div className="flex flex-col gap-1">
            <label htmlFor="projectId" className="text-sm font-medium">
              プロジェクト
            </label>
            <select id="projectId" name="projectId" required defaultValue="" className="border rounded px-3 py-2">
              <option value="">選択してください</option>
              {joinableProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="flex flex-wrap items-center gap-2 text-sm">
            <legend className="text-sm font-medium">ロール</legend>
            {roles.map((role) => (
              <label key={role.id} className="flex items-center gap-1">
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
            {pending ? "追加中…" : "プロジェクトに追加"}
          </button>
        </form>
      )}
    </section>
  );
}
