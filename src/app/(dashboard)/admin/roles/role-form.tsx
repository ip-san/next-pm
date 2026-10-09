"use client";

import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { useActionState } from "react";
import { createRoleAction, updateRoleAction } from "@/interface/actions/admin-role-actions";
import type { AdminActionState } from "@/interface/actions/admin-action-state";
import { isBuiltinRole, setablePermissions, ROLE_BUILTIN_MEMBER, type Role } from "@/domain/role/entity";
import { MODULE_LABEL_KEY, PERMISSION_LABEL_KEY, PERMISSIONS_BY_MODULE } from "./permission-labels";

const initialState: AdminActionState = { error: null };

/**
 * Doubles as the create and the edit form.
 *
 * A builtin role (Non member / Anonymous) keeps its name and its assignable flag fixed —
 * Redmine recreates those rows by builtin value and never gives them to a project member — and
 * only shows the permissions Role#setable_permissions allows it to hold.
 */
export function RoleForm({ locale = "ja", role, roles = [] }: { role?: Role; roles?: Role[]; locale?: Locale }) {
  const t = (key: MessageKey) => translate(locale, key);
  const [state, formAction, pending] = useActionState(role ? updateRoleAction : createRoleAction, initialState);
  const builtin = role ? isBuiltinRole(role) : false;
  const setable = new Set(setablePermissions(role?.builtin ?? ROLE_BUILTIN_MEMBER));
  const checked = new Set(role?.permissions ?? []);

  return (
    <form action={formAction} className="flex flex-col gap-3 max-w-lg border-t pt-4">
      {role ? <input type="hidden" name="roleId" value={role.id} /> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          {t("admin.roles.name")}
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
          {t("admin.roles.issuesVisibility")}
        </label>
        <select
          id="issuesVisibility"
          name="issuesVisibility"
          defaultValue={role?.issuesVisibility ?? "default"}
          className="border rounded px-3 py-2"
        >
          <option value="all">{t("admin.roles.visAllIssues")}</option>
          <option value="default">{t("admin.roles.visDefault")}</option>
          <option value="own">{t("admin.roles.visOwn")}</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="timeEntriesVisibility" className="text-sm font-medium">
          {t("admin.roles.timeEntriesVisibility")}
        </label>
        <select
          id="timeEntriesVisibility"
          name="timeEntriesVisibility"
          defaultValue={role?.timeEntriesVisibility ?? "all"}
          className="border rounded px-3 py-2"
        >
          <option value="all">{t("admin.roles.timeAll")}</option>
          <option value="own">{t("admin.roles.timeOwn")}</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="usersVisibility" className="text-sm font-medium">
          {t("admin.roles.usersVisibility")}
        </label>
        <select
          id="usersVisibility"
          name="usersVisibility"
          defaultValue={role?.usersVisibility ?? "all"}
          className="border rounded px-3 py-2"
        >
          <option value="all">{t("admin.roles.usersAll")}</option>
          <option value="members_of_visible_projects">{t("admin.roles.usersMembers")}</option>
        </select>
      </div>

      {builtin ? null : (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="assignable" defaultChecked={role?.assignable ?? true} />
          {t("admin.roles.assignable")}
        </label>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">{t("admin.roles.permissions")}</legend>
        {Object.entries(PERMISSIONS_BY_MODULE).map(([moduleKey, keys]) => {
          const visible = keys.filter((key) => setable.has(key));
          if (visible.length === 0) return null;
          return (
            <div key={moduleKey} className="flex flex-col gap-1">
              <p className="text-xs font-medium text-gray-600">{translate(locale, MODULE_LABEL_KEY[moduleKey])}</p>
              {visible.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="permissions" value={key} defaultChecked={checked.has(key)} />
                  {translate(locale, PERMISSION_LABEL_KEY[key])}
                </label>
              ))}
            </div>
          );
        })}
      </fieldset>

      {role || roles.length === 0 ? null : (
        <div className="flex flex-col gap-1">
          <label htmlFor="copyWorkflowFrom" className="text-sm font-medium">
            {t("admin.roles.copyWorkflowFrom")}
          </label>
          <select id="copyWorkflowFrom" name="copyWorkflowFrom" defaultValue="" className="border rounded px-3 py-2">
            <option value="">{t("admin.roles.copyNone")}</option>
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
        {pending ? t("issue.saving") : role ? t("admin.users.saveChanges") : t("admin.roles.add")}
      </button>
    </form>
  );
}
