"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
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
  locale = "ja",
}: {
  userId: string;
  member: Member;
  roles: Role[];
  editable: boolean;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
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
        {t("admin.users.inheritedFromGroup")}
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
          {updating ? t("issue.saving") : t("issue.save")}
        </button>
      </form>
      <form action={removeFormAction}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="memberId" value={member.id} />
        <button type="submit" disabled={removing} className="text-red-700 underline disabled:opacity-50">
          {removing ? t("admin.deleting") : t("issue.delete")}
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
  locale = "ja",
}: {
  userId: string;
  rows: MembershipRow[];
  roles: Role[];
  joinableProjects: Project[];
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(addUserMembershipAction, initialState);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{t("admin.projects")}</h2>
      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="pr-4 py-1">{t("admin.projects")}</th>
            <th className="pr-4 py-1">{t("members.roles")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ member, project }) => (
            <tr key={member.id} className="border-b align-top">
              <td className="pr-4 py-1">{project?.name ?? "?"}</td>
              <td className="pr-4 py-1">
                <MembershipRowControls locale={locale}
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
                {t("admin.users.noMemberships")}
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
              {t("admin.projects")}
            </label>
            <select id="projectId" name="projectId" required defaultValue="" className="border rounded px-3 py-2">
              <option value="">{t("admin.select")}</option>
              {joinableProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="flex flex-wrap items-center gap-2 text-sm">
            <legend className="text-sm font-medium">{t("members.roles")}</legend>
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
            {pending ? t("issue.adding") : t("admin.users.addToProject")}
          </button>
        </form>
      )}
    </section>
  );
}
